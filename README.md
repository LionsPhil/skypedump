# SkypeDump
Dump your Skype `main.db` as IRC-like text.

# Setup
You'll need an [an up-to-date `node` install](https://nodejs.org/en/download/package-manager/).

Clone/download, and run these to install depenencies and compile:
```sh
npm install
node_modules/.bin/typings install
node_modules/.bin/tsc
```

# Running
```sh
node app.js path_to_main.db
```
If no path is provided, looks for `main.db` in the current directory.
This database is opened read-only.

# Output
Writes a heap of text files under an `out` subdirectory of the current working directory.
These are overwritten without warning.
The format is designed to be human-readable, and looks like an IRC log.
(If you want machine-processable, the `main.db` is already a SQLite database.)