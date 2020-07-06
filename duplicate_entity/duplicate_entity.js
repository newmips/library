const models = require('../models');
const fs = require('fs-extra');
const globalConfig = require('../config/global');
const moment = require('moment');

async function duplicateFile(entityName, entitySource, fileAttribute) {
	const sourceFileName = entitySource[fileAttribute];
	const sourceFolder = sourceFileName.split('-')[0];
	const sourceFilePath = `${globalConfig.localstorage}${entityName}/${sourceFolder}/${sourceFileName}`;

    const dateStr = moment().format("YYYYMMDD-HHmmss");
    const newFolderName = dateStr.split('-')[0];
	const newFileName = `${dateStr}_DUPLICATE_${sourceFileName.split('-')[1]}`;
    const newFilePath = `${globalConfig.localstorage}${entityName}/${newFolderName}/${newFileName}`;

    try {
    	await fs.copy(sourceFilePath, newFilePath);
    } catch (err) {
    	console.error(`WARN: Couldn't duplicate file ${sourceFileName}`);
    	console.error(err);
    }

    return [newFilePath, newFileName];
}

module.exports = async function(entityId, entityName, includes) {
	const transaction = await models.sequelize.transaction();
	const duplicatedInfos = [];
	const duplicatedFilesPath = [];

	async function duplicate(params) {
		const {
			entityId,
			entityName,
			alias,
			includes
		} = params;
		const modelName = `E_${entityName.slice(2)}`;

		// Find entity to copy
		const source = await models[modelName].findOne({where: {id: entityId}});
		if (!source)
			throw `ERROR: duplicate() - ${modelName} id ${entityId} not found`;

		// Copy source values to new object
		const duplicateValues = {...source.get()};
		// Delete id to allow autoincrement
		delete duplicateValues.id;

		// Copy files and update filename in duplicatedValues
		const attributes = require(`../models/attributes/${entityName}`);
		for (const attrName in attributes) {
			if (attributes[attrName].newmipsType === 'file' && source[attrName]) {
				const [filePath, fileName] = await duplicateFile(entityName, source, attrName);
				duplicateValues[attrName] = fileName;
				duplicatedFilesPath.push(filePath);
			}
		}

		// Create duplicate
		const duplicated = await models[modelName].create(duplicateValues, {transaction, hooks: false});

		const options = require(`../models/options/${entityName}`);
		for (const currentInclude of includes || []) {
			const aliasFunc = `R_${currentInclude.as.slice(2)}`;
			const [option] = options.filter(opt => opt.as == currentInclude.as);

			// Copy related entity and link to duplicated entity
			if (option.relation == 'belongsTo') {
				if (source[option.foreignKey] != null) {
					const subSourceDuplicateId = await duplicate({
						entityId: source[option.foreignKey],
						entityName: option.target,
						alias: currentInclude.as,
						includes: currentInclude.include
					});

					await duplicated[`setR_${option.as.slice(2)}`](subSourceDuplicateId, {transaction, hooks: false});
				}
			}
			// Duplicate each related entity and link to duplicated entity
			else if (option.relation == 'hasMany') {
				let limit = 50, offset = 0;
				const subDuplicatesIds = [];
				let subSources;
				do {
					subSources = await source[`get${aliasFunc}`]({
						limit,
						offset
					});
					for (const subDuplicate of subSources) {
						const newId = await duplicate({
							entityId: subDuplicate.id,
							entityName: option.target,
							alias: currentInclude.as,
							includes: currentInclude.include
						});
						subDuplicatesIds.push(newId);
					}
					offset += limit;
				} while (subSources.length == limit)

				await duplicated[`set${aliasFunc}`](subDuplicatesIds, {transaction, hooks: false});
			}
			// Only duplicate entries in belongsToMany `through` table, poiting to the duplicated entity
			else if (option.relation == 'belongsToMany') {
				const belongsToMany = await models.sequelize.query(`
					SELECT ${option.otherKey} FROM ${option.through} WHERE ${option.foreignKey} = ${source.id}
				`, { type: models.sequelize.QueryTypes.SELECT });
				const belongsToManyIds = belongsToMany.map(rel => rel[option.otherKey]);

				await duplicated[`set${aliasFunc}`](belongsToManyIds, {transaction, hooks: false});
			}
		}

		duplicatedInfos.push({
			entityName,
			alias,
			originId: entityId,
			duplicatedId: duplicated.id
		});
		return duplicated.id;
	}

	try {
		const newId = await duplicate({
			entityId,
			entityName,
			includes
		});
		await transaction.commit();

		return [newId, duplicatedInfos];
	} catch (err) {
		// Delete duplicated files
		for (const filePath of duplicatedFilesPath) {
			try {
				await fs.unlink(filePath);
			} catch(err) {;}
		}
		// Rollback all sql queries
		await transaction.rollback();
		throw err;
	}
}
