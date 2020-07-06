
<p align="center">
	<img width="150" height="150" src="https://raw.githubusercontent.com/newmips/newmips/dev/public/img/FAVICON-GRAND-01.png">
</p>

# Inbox watcher
<br><br>

This module allows a node process to listen for new mail event on a specified mailbox.
<br>
It will fetch any incoming mail and its attachments and call the provided callback with the results.
<br>

## Usage

Only the function listen() is exported by the module. It is required to initialize the connection with the mail inbox and should be called only once.
<br><br>
listen() takes a callback as parameter to allow fetched mails processing.
<br>
listen()'s callback should expect an array of mail object of the form :
<pre>
mails = [{
    body: '',
    header: '',
    filenames: [],
    seqno
}]
</pre>
Attachment files are written on disk, and filesnames are provided to the callback

### Example

<pre>
const inbox = require('inbox_watcher');

function handleMails(mails) {
	for (const mail of mails) {
		console.log(mail.header);
		console.log(mail.body);
	}
}

inbox.listen(handleMails)
        .then(_ => console.log('Imap init done. Connected to mail inbox.'))
        .catch(error => {
            console.error("/!\\ Couldn't initialize mail inbox connection /!\\");
        });
</pre>
