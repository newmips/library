const models = require('../models/');
const fs = require('fs-extra');
const moment = require('moment');
const language = require('../services/language');

const DELIMITER = ',';

{ // Import

	function formatError(err, lang_user) {
		let message = err.message.replace(/at row.*/, '');
		try {
			// ForeignKey constraint failed
			if (err.parent.errno == 1452) {
				const foreignEntityRegex = new RegExp(/FOREIGN KEY \(`(.*)`\) REFERENCES `17_(.*)`/);
				const [fullMatch, columnName, entityName] = foreignEntityRegex.exec(err.message);
				if (entityName)
					message = `La colonne ${columnName} réference un ID inexistant de l'entité ${language(lang_user).__("entity."+entityName+".label_entity")}`;
			}
			// Wrong value type for column
			else if (err.parent.errno == 1366) {
				const wrongValueRegex = new RegExp(/Incorrect (.*) value: '(.*)' for column '(.*)'/);
				const [fullMatch, columnType, columnValue, columnName] = wrongValueRegex.exec(err.message);
				message = `La valeur '${columnValue}' n'est pas valide pour la colonne ${columnName}. Un type '${columnType}' est attendu`;
			}
		} catch(e){
			;
		}
		return message;
	}

	function checkValidity(modelName, header, lang_user) {
		if (!header || !header[0])
			throw [{message: 'Aucunne données dans le fichier', row: 1}];
		header = header[0].split(DELIMITER);
		const validAttributes = models[modelName].rawAttributes, inputOrderedAttributes = [], __ = language(lang_user).__, errors = [];

		for (let fileAttribute of header) {
			fileAttribute = fileAttribute.trim();
			let matchedAttribute = false;
			// No traduction to find for these attributes
			if (['id', 'version'].includes(fileAttribute.toLowerCase())
			|| fileAttribute.includes('fk_id_')
			|| ['createdby','updatedby'].includes(fileAttribute.toLowerCase()))
				matchedAttribute = {
					type: 'INTEGER',
					attr: fileAttribute
				}
			else if (['createdat','updatedat'].includes(fileAttribute.toLowerCase()))
				matchedAttribute = {
					type: 'DATETIME',
					attr: fileAttribute.toLowerCase()
				}
			else
				// Look for a matching traduction for header parts
				for (const validAttribute in validAttributes)
					if (__(`entity.${modelName.toLowerCase()}.${validAttribute}`) == fileAttribute) {
						matchedAttribute = {
							type: validAttributes[validAttribute].type.constructor.name, // Get sequelize Type object's name
							attr: validAttribute
						}
						break;
					}

			if (matchedAttribute == false)
				errors.push({
					message: 'La colonne '+fileAttribute+' n\'est pas reconnue',
					row: 1
				});
			inputOrderedAttributes.push(matchedAttribute);
		}

		if (errors.length)
			throw errors;

		return inputOrderedAttributes;
	}

	async function doImport(modelName, csvData, orderedAttributes, lang_user) {
		// Use transaction to allow rollback on error
		const transaction = await models.sequelize.transaction(), errors = [];

		let inserted = 0, updated = 0, rowNumber = 0;
		while (++rowNumber < csvData.length) {
			// Empty line, usualy last line '\n', ignore row
			if (csvData[rowNumber].length == 0)
				continue;

			const rowObject = {};
			csvData[rowNumber] = csvData[rowNumber].split(DELIMITER);
			for (let j = 0; j < csvData[rowNumber].length; j++) {
				// Ignore createdAt/updatedAt, ensure orderedAttribute exist
				if (!orderedAttributes[j] || ['createdby','updatedby'].includes(orderedAttributes[j].attr.toLowerCase()))
					continue;

				const attr = orderedAttributes[j].attr;
				const value = csvData[rowNumber][j].replace(/\r/g, '');
				let validValue;
				// Format value depending on type
				switch (orderedAttributes[j].type) {
					case 'DATE':
						rowObject[attr] = moment(value, "DD/MM/YYYY").toDate();
						break;

					case 'DATETIME':
						rowObject[attr] = moment(value, "DD/MM/YYYY hh:mm:ss").toDate();
						break;

					case 'INTEGER':
						validValue = isNaN(parseInt(value)) ? null : parseInt(value);
						rowObject[attr] = validValue;
						break;

					case 'FLOAT':
					case 'DOUBLE':
						validValue = isNaN(parseFloat(value)) ? null : parseFloat(value);
						rowObject[attr] = validValue;
						break;

					case 'BOOLEAN':
						validValue = value == "" || isNaN(parseInt(value)) ? null : parseInt(value);
						rowObject[attr] = validValue;
						break;

					default:
						rowObject[attr] = value;
				}
			}

			// Upsert row
			try {
				const isInserted = await models[modelName].upsert(rowObject, {hooks: false, transaction});
				if (isInserted)
					inserted++;
				else
					updated++;
			}
			catch(err) {
				const errMessage = formatError(err, lang_user);
				errors.push({
					message: errMessage,
					row: rowNumber+1
				});
			}
		}

		// If errors occured, rollback transaction and throw errors array
		if (errors.length) {
			await transaction.rollback();
			throw errors;
		}

		// Commit transaction to apply import in DB
		await transaction.commit();

		return {inserted, updated, errors};
	}

	exports.import = async (modelName, csvData, lang_user = 'fr-FR') => {
		try {
			// Delete empty lines and split by row
			const csvLines = csvData.replace(/^\s*$(?:\r?|\n?)/gm, '').split('\n');
			// Check given attributes validity and get ordered attributes array
			const orderedAttributes = checkValidity(modelName, csvLines, lang_user);
			// Upsert rows
			return await doImport(modelName, csvLines, orderedAttributes, lang_user);
		} catch(e) {
			return {inserted:[],updated:[],errors: e};
		}
	}
}

{ // Export

	function write(wStream, header, data, isHeader = false) {
		return new Promise((resolve, reject) => {
			// Write header
			if (isHeader)
				return wStream.write(data.join(DELIMITER)+'\n', resolve);

			// Format row
			const formattedRows = [];
			for (let i = 0; i < data.length; i++) {
				const rowValue = [];
				for (const attribute of header) {
					let colValue = data[i][attribute];
					colValue = !colValue ?
									''
								: colValue instanceof String ? // Replace DELIMITER by blank
									colValue.replace(new RegExp("["+DELIMITER+"\r\n]", 'g'), ' ')
								: colValue instanceof Date ? // Format date
									moment(colValue).format('DD/MM/YYYY hh:mm:ss')
								: colValue // No modification
					rowValue.push(colValue);
				}

				formattedRows.push(rowValue.join(DELIMITER));
			}

			// Write row
			wStream.write(formattedRows.join('\n')+'\n', resolve);
		});
	}

	async function doExport(modelName, wStream, userLang = 'fr-FR') {
		if (!models[modelName])
			throw "Cible de l'export inconnue";

		const limit = 5000, __ = language(userLang).__, header = [], headerTrad = [];
		let results, offset = 0;
		do {
			results = await models[modelName].findAll({limit, offset})

			// First loop, write header
			if (offset == 0 && results.length) {
				// Get attributes list from sequelize result options
				// Build traduction key for header
				for (const attr of results[0]._options.attributes) {
					header.push(attr);
					let traduction;
					if (['id','version','createdat','updatedat','createdby','updatedby'].includes(attr.toLowerCase()) || attr.includes('fk_id_'))
						traduction = attr;
					else
						traduction = __(`entity.${modelName.toLowerCase()}.${attr}`);
					headerTrad.push(traduction);
				}
				await write(wStream, header, headerTrad, true);
			}

			// Write results
			await write(wStream, header, results);
			offset += limit;
		}
		while (results && results.length == limit)
	}

	exports.export = (modelName, userLang = 'fr-FR') => {
		return new Promise((resolve, reject) => {
			const exportFileDir = `${__dirname}/../files/export/`
			const exportFileName = `export_${modelName}_${new Date().getTime()}.csv`;
			const exportFullPath = `${exportFileDir}/${exportFileName}`;

	        fs.mkdirs(exportFileDir, function (err) {
	            if (err)
	                return reject(err);
				const wStream = fs.createWriteStream(exportFullPath, {encoding: 'utf8'});

				wStream.on('open', _ => {
					doExport(modelName, wStream, userLang).then(_ => {
						wStream.close(_ => {
							resolve(exportFullPath);
						})
					}).catch(err => {
						reject(err);
					});
				});
			});
		});
	}
}
