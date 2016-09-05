"use strict";

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as sqlite3 from 'sqlite3';
import * as util from 'util';

let filename = "main.db";
let outdir = "out";

if(process.argv.length > 2) {
	filename = process.argv[2];
}

if(fs.existsSync(outdir)) {
	console.warn("Output directory already exists. Will overwrite contents!");
} else {
	fs.mkdirSync(outdir);
}

let db = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, (err) => {
	if(err !== null) { console.error(err); process.exit(1); }

	// there is also "author", as their raw account name
	let message_query = db.prepare(
		"SELECT id, chatmsg_type, timestamp, author, from_dispname, body_xml, identities "
		+ "FROM Messages WHERE convo_id = ? ORDER BY timestamp ASC");

	db.each("SELECT id, displayname FROM Conversations",
		(err, row) => {
			if(err !== null) { console.error(err); process.exit(1); }
			// Process this conversation
			let safe_dn = (<string> row.displayname).replace(/[:\\/]/g, '_');
			let conv_fn = `${safe_dn} (${row.id}).txt`;
			let wstream = fs.createWriteStream(`${outdir}/${conv_fn}`);

			message_query.bind([row.id]);
			message_query.each(
				(err, row) => {
					if(err !== null) { console.error(err); process.exit(1); }

					// Format this message
					/* toISOString goes to millisecond resolution we don't have,
					 * but without printf-style formatting for dates or numbers,
					 * doing this manually with getUTCFullYear() and friends and
					 * having to zero-pad them is ugly as sin. So, regexes. */
					let timestamp = (new Date(row.timestamp * 1000))
						.toISOString()
						.replace(/T/, ' ')
						.replace(/\.000Z$/, '');
					// mixed DOS line endings, YEUCH
					let body_xml = (row.body_xml === null)
						? null
						: (<string> row.body_xml).replace(/\r/g, '');
					let body = cheerio.load(`<html>${body_xml}</html>`).root().text();
					let line = `! Something not understood with ID ${row.id} (type ${row.chatmsg_type})`;

					// patch around calls with broken IDs by detecting the XML
					if(row.chatmsg_type === null
						&& body_xml !== null
						&& body_xml.startsWith('<partlist ')) {

						row.chatmsg_type = 18;
					}

					switch(<number> row.chatmsg_type) {
						case 1: // adding someone
						case 2: // creating the conversation(?)
							line = `- ${row.identities} joined`;
							break;
						case 3: // plain text message
							line = `<${row.from_dispname}> ${body}`;
							break;
						case 4: // someone leaves
							line = `- ${row.identities} left`;
							break;
						case 5: // chat renamed
							line = `- ${row.from_dispname} renamed chat to ${body}`;
							break;
						case 6: // looks like some kind of call update?
							line = `# call changes somehow? Has ${row.identities}`;
							break;
						case 7: // /me action
							line = `* ${row.from_dispname} ${body}`;
							break;
						case 8: //sending contacts
							// abuse cheerio for some of the details
							let contacts = cheerio.load(body_xml);
							line = `- ${row.from_dispname} sent contact`
								+ contacts('c').attr('f');
							break;
						case 11: // another, rare way someone leaves?
							line = `- ${row.identities} left (maybe?)`;
							break;
						case 15: // chat image changed
							line = `- ${row.from_dispname} changed chat image`;
							break;
						case 18: // call
							if(body_xml == null) {
								// one-to-one calls, or contact adds?
								line = "- call, or contact add, or something";
							} else {
								// participants are in an XML document
								let partlist = cheerio.load(body_xml);
								line = "# call involving "
									+ partlist('name')
										.map((i, e) => {return partlist(e).text()})
										.get().join(', ');
							}
							break;
						default:
							let handled = false;
							if(row.chatmsg_type === null) {
								// seriously, skype? sometimes this is *normal*
								if(body_xml !== null && body_xml.startsWith('<files ')) {
									// file transfer
									let files = cheerio.load(body_xml);
									// 99% of the time skype does this for us...
									let sent = files('files').attr('alt');
									if(!sent) {
										// ...the 1%'s a kicker
										sent = 'sent ' + files('file')
											.map((i, e) => {return files(e).text();})
											.get().join(', ');
									}
									line = `- ${row.from_dispname} ${sent}`;
									handled = true;
								}
							}
							if(!handled) {
								// null types are SO spammy that we skip warning them
								if(row.chatmsg_type !== null) {
									console.warn(`Unhandled: ${util.format(row)}`);
								}
								if(row.from_displayname)
									{ line += ` from ${row.from_displayname}`; }
								if(row.identities)
									{ line += ` involving ${row.identities}`;}
								if(body_xml) // parsed form often not useful
									{ line += ` (${body_xml})`; }
							}
					}

					wstream.write(`${timestamp} ${line}\n`);
				},
				(err, num) => {
					if(err !== null) { console.error(err); process.exit(1); }
					wstream.end();
					if(num == 0) {
						fs.unlinkSync(`${outdir}/${conv_fn}`);
						console.log(`Didn't keep empty conversation with ${row.displayname}`);
					} else {
						console.log(`Dumped ${num} messages from ${row.displayname}`);
					}
				}
			);
		},
		(err, num) => {
			if(err !== null) { console.error(err); process.exit(1); }
			// Done all conversations
			console.log(`Dumped a total of ${num} conversations`);

			// Shut down
			message_query.finalize();
			db.close();
		}
	);
});