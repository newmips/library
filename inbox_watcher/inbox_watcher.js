const fs = require("fs");
const buffer = require("buffer");
const base64 = require('base64-stream')
const Imap = require("imap");
const utf8 = require('utf8');
const quotedPrintable = require('quoted-printable');

let imap;

const FETCH_BODY = "HEADER.FIELDS (FROM TO SUBJECT DATE)";

let FILE_COUNT = 0;

function toUpper(thing) {
    return thing && thing.toUpperCase ? thing.toUpperCase() : thing;
}

function findAttachmentParts(struct, attachments = []) {
    for (var i = 0, len = struct.length, r; i < len; ++i)
        if (Array.isArray(struct[i]))
            findAttachmentParts(struct[i], attachments);
        else {
            if (struct[i].disposition && ["INLINE", "ATTACHMENT"].indexOf(toUpper(struct[i].disposition.type)) > -1)
                attachments.push(struct[i]);
        }
    return attachments;
}

function buildAttachment(mailObject, attachment, msg, seqno) {
    return new Promise((resolve, reject) => {
        var filename = ++FILE_COUNT+'-'+attachment.params.name;
        var encoding = attachment.encoding;

        msg.on("body", function(stream, info) {
            try {
                //Create a write stream so that we can stream the attachment to file;
                var writeStream = fs.createWriteStream(filename);
                if (toUpper(encoding) === "BASE64")
                    stream.pipe(new base64.Base64Decode()).pipe(writeStream);

                writeStream.on("finish", function() {
                    mailObject.filenames.push(filename);
                    resolve();
                });
            } catch(e) {
                console.error(e);
            }
        });
        msg.once('error', function(err) {
            console.error(err);
            reject();
        });
    });
}

function buildMail(mail, msg, seqno) {
    return new Promise((resolve, reject) => {
        let struct;
        const attachmentPromises = [];
        msg.on("body", function(stream, info) {
            // Build body
            if (info.which === '1') {
                stream.on('data', function(chunk) {
                    mail.body += chunk;
                });
            }
            // Build header and parse it to object
            else if (info.which === FETCH_BODY) {
                stream.on('data', function(chunk) {
                    mail.header += chunk.toString('utf8')
                });
                stream.once('end', function() {
                    mail.header = Imap.parseHeader(mail.header)
                });
            }
        });
        msg.once("attributes", function(attrs) {
            struct = attrs.struct;
            var attachments = findAttachmentParts(attrs.struct);
            // Fetch attachments
            for (var i = 0, len = attachments.length; i < len; ++i) {
                attachmentPromises.push((attachment => {
                    return new Promise((attReso, attReje) => {
                        var fetchAttachment = imap.fetch(attrs.uid, {
                            bodies: [attachment.partID]//, struct: true
                        });
                        // Process attachment message
                        fetchAttachment.on("message", function(msg, seqno) {
                            buildAttachment(mail, attachment, msg, seqno).then(attReso).catch(attReje)
                        });
                    });
                })(attachments[i]));
            }
        });
        msg.once("end", function() {
            try {
                if (struct[1] && struct[1][0] && struct[1][0].encoding == 'BASE64')
                    mail.body = new Buffer(mail.body, 'base64').toString('utf8');
                else if (struct[2] && struct[2][0] && struct[2][0].encoding && struct[2][0].encoding.toUpperCase() == "QUOTED-PRINTABLE")
                    mail.body = utf8.decode(quotedPrintable.decode(mail.body));
                else
                    mail.body = mail.body.toString('utf8');
            } catch(err) {
                console.error("Couldn't decode mail body");
                return reject(err);
            }

            Promise.all(attachmentPromises).then(_ => {
                console.log(`Mail ${seqno} done`);
                resolve(mail);
            });
        });
        msg.once('error', function(err) {
            console.error("Error fetching mail");
            console.error(err);
        })
    });
}

function fetchMails(callback) {
    imap.search(['UNSEEN'], function(err, results) {
        if (err)
            return console.error(err);

        const fetch = imap.fetch(results, {
            bodies: [FETCH_BODY, "1"],
            struct: true,
            markSeen: true
        });

        const mails = [];
        const mailsPromises = [];

        fetch.on("message", function(msg, seqno) {
            console.log("Processing mail");
            const mail = {
                body: '',
                header: '',
                filenames: [],
                seqno
            }
            mails.push(mail);
            mailsPromises.push(buildMail(mail, msg, seqno));
        });
        fetch.once("error", function(err) {
            console.error('Fetch error :');
            console.error(err);
        });
        fetch.once("end", function() {
            Promise.all(mailsPromises).then(_ => {
                callback(mails);
            })
        });
    });
}

exports.listen = (inboxConf, callback) => {
    return new Promise((resolve, reject) => {
        if (!imap) {
            try {
                imap = new Imap(inboxConf);
            } catch (error) {
                reject(error);
            }
        }

        imap.once("ready", function() {
            imap.openBox('INBOX', false, function(err, box) {
                if (err)
                    return reject("Unable to open inbox");

                // Bind to new mail event
                imap.on('mail', function() {
                    console.log("New mail event");
                    // Ensure FILE_COUNT can't go above integer limit (Not many chances but you never know)
                    if (FILE_COUNT-1 == Number.MAX_AGE_INTEGER)
                        FILE_COUNT = 0;
                    // Fetch/build emails and pipe them to callback
                    fetchMails(callback);
                });

                // Notify ready to receive mails
                resolve()
            })
        });
        imap.once("error", function(err) {
            reject(err);
        });
        imap.once("end", function() {
            console.log("Connection ended");
        });

        imap.connect();
    })
}
