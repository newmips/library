
<p align="center">
	<img width="150" height="150" src="https://raw.githubusercontent.com/newmips/newmips/dev/public/img/FAVICON-GRAND-01.png">
</p>

# Inbox watcher
<br>

This module allows a node process to listen for new mail event on a specified mailbox.
<br>
It will fetch any incoming mail and its attachments and call the provided callback with the mail content and attachments.
<br>

## Usage

Only the function `listen(inboxConf, callback)` is exported by the module. It is required to initialize the connection with the mail inbox and should be called only once.
<br><br>
It takes a configuration object to connect to the inbox and a callback to allow fetched mails processing as parameters.
<br>
Inbox configuration is expected as follow :
<pre>
{
	user: '',
    password: '',
    host: '',
    port: 42,
    tls: true
}
</pre>

callback should expect an array of mail object of the form :
<pre>
callback(mails = [{
    body: '',
    header: '',
    filenames: [],
    seqno
}])
</pre>
Attachment files are written on disk, and filenames are provided to the callback

## Example

<pre>
const inbox = require('inbox_watcher');
const inboxConf = {
  user: '',
  password: '',
  host: '',
  port: 42,
  tls: true
};
</pre>

<pre>
function handleMails(mails) {
	for (const mail of mails) {
		console.log(mail.header);
		console.log(mail.body);
	}
}
</pre>
<pre>
inbox.listen(inboxConf, handleMails)
  .then(_ => console.log('Imap init done. Connected to mail inbox.'))
  .catch(error => {
      console.error("/!\\ Couldn't initialize mail inbox connection /!\\");
  });
</pre>

## /!\ Note

The handling of filename and filepath of attachments is very basic because it was written for basic needs. It needs to be reworked or at least looked upon