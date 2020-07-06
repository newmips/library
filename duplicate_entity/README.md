
<p align="center">
	<img width="150" height="150" src="https://raw.githubusercontent.com/newmips/newmips/dev/public/img/FAVICON-GRAND-01.png">
</p>

# Duplicate entity
<br>

This module create a deep copy of an entity.
<br>
The copy includes :
<ul>
  <li>Source entity</li>
  <li>Every relations specified</li>
  <li>Related files</li>
</ul>

## Usage

The module exports an async function `async function(entityId, entityName, includes)` where :
<ul>
  <li>`entityId` - ID of the entity to copy</li>
  <li>`entityName` - Name of entity to copy with its prefix (Ex: 'e_user')</li>
  <li>`includes` - A sequelize valid include object of the relations to copy</li>
</ul>
<br>
It returns an array containing `[newId, duplicatedInfo]`.<br>
`newId` is the created entity's id and `duplicatedInfo` an array with information about what  has been copied<br>
<pre>
  duplicateInfo = [
    {
      entityName: 'e_entity',
      alias: 'r_alias',
      originId: 42,
      duplicatedId: 84
    }
  ]
</pre>
<br>
<ul>
  <li>It relies on `models/options/e_entity.json` and `models/attributes/e_entity.json` to find what to copy.</li>
  <li>It must run in a newmips application environment and expect attributes and options files as well as `/config/global`.</li>
  <li>Every operation is reversed on error. A database transaction is rolled back to starting state and all files created are deleted.</li>
  <li>Duplicated files will be renamed following application's naming convention with new dates and '_DUPLICATE_' inserted :<br>`${globalConfig.localstorage}/${entityName}/YYYYMMDD/YYYYMMDD-HHmmss_DUPLICATE_${sourceFileName}`</li>
</ul>

## Example

<pre>
const includeFields = ['r_group.id', 'r_role.id', 'r_document.id'];
const include = model_builder.getIncludeFromFields(models, 'e_usager', includeFields);
</pre>
<pre>
let newId, duplicatedInfo;
try {
  [newId, duplicatedInfo] = await duplicate(idUser, 'e_user', include);
} catch (err) {
    console.error(err);
}
</pre>