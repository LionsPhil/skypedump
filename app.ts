"use strict";

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as sqlite3 from 'sqlite3';

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
		"SELECT timestamp, author, from_dispname, body_xml "
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
					// FIXME adding people doesn't show sensibly
					// FIXME calls don't show sensibly
					// FIXME mixed DOS line-endings at parts (YEUCH)
					let timestamp = (new Date(row.timestamp * 1000)).toISOString();
					let body = cheerio.load(`<html>${row.body_xml}</html>`).root().text();
					let line = `${timestamp} <${row.from_dispname}> ${body}\n`;
					wstream.write(line);
				},
				(err, num) => {
					if(err !== null) { console.error(err); process.exit(1); }
					console.log(`Dumped ${num} messages from ${row.displayname}`);
					wstream.end();
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