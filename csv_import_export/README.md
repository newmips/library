<p align="center">
	<img width="150" height="150" src="https://raw.githubusercontent.com/newmips/newmips/dev/public/img/FAVICON-GRAND-01.png">
</p>

# CSV Import / Export

This module allow import to database from CSV file as well as export from database to CSV file of newmips entities.
<br>
It exports two functions :
<br>
`async function export(modelName, userLang = 'fr-FR')`
<br>
`async function import (modelName, csvData, lang_user = 'fr-FR')`
<br>
<br>
Neither of these function handle relations `hasMany` or `belongsToMany`

## Export

The `export()` function will export all rows of the specified model and return a path to the created CSV file.
<br>
<br>
The CSV header will be generated using translation file of the provided language (default 'fr-FR'). CSV header must use translated column values (Ex: 'Label' instead of 'f_label')
<br>
<br>
All attributes will be exported.

### Example

<pre>
const import_export = require('../utils/csv_import_export');
router.get('/export_groups', function(req, res) {
	import_export.export('E_group').then(filepath => {
		res.download(filepath); // __dirname+'/../files/export/export_E_group_123731387.csv'
	}).catch(err => {
		res.status(500).send(err);
	});
});
</pre>

Output CSV file :
<table>
	<thead>
		<tr>
			<th>id</th>
			<th>Label</th>
			<th>createdBy</th>
			<th>updatedBy</th>
			<th>createdAt</th>
			<th>updatedAt</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>1</td>
			<td>Admin</td>
			<td>Benoit</td>
			<td>Aurelie</td>
			<td>23/06/2020 13:37:42</td>
			<td>23/06/2020 13:42:84</td>
		</tr>
		<tr>
			<td>2</td>
			<td>User</td>
			<td>Benoit</td>
			<td>Frederick</td>
			<td>23/06/2020 13:37:42</td>
			<td>23/06/2020 13:42:84</td>
		</tr>
	</tbody>
</table>

## Import

The `import()` function will parse the first row of data provided to match translation of the provided language to targeted fields ('Label' will match entity's 'f_label' attribute).
<br>
`id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` and `fk_id_*` are matched as is and not through translation
<br>
<br>
Order or absence of columns doesn't matter.
<br>
<br>
On error a mysql transaction is rolled back and database stay untouched
<br>
<br>
The best way to get an import file template is by doing an export first

### Error handling

Import errors does not stop import execution. Errors are stored in an array and returned to the caller.
<br>
Import's modification will be rolled back if at least one error occurs.
<br>
<br>
Each error entry provide a simplified and translated error message, as well as the line on which it occured to ease correction for lambda users.

### Example

<pre>
const import_export = require('../utils/csv_import_export');<br>
router.post('/import', function(req, res) {
	upload(req, res, err => {
		if (err)
			return console.error(err);
		import_export.import('E_group', req.file.buffer.toString()).then(result => {
            if (result.errors.length) {
                // No need to send all errors, reduce data sent
                if (result.errors.length > 100)
                    result.errors = result.errors.slice(0, 100);
                console.log(result.errors);
				//	[
				//		{message: `La colonne fk_id_officer réference un ID inexistant de l'entité User`, row: 1}
				//		{message: `La valeur 'Benoit' n'est pas valide pour la colonne Id. Un type 'integer' est attendu`, row: 2}
				//	]
            }
            else
            	console.log('Success');
		}).catch(err => {
			console.log("Unkown error")
		});
	});
})
</pre>

## TO DO

This module only provide basic functionality so far.
<br>
Main missing features are :
<ul>
	<li>Specify which attributes to export</li>
	<li>Handle `hasMany` and `belongsToMany` relations</li>
	<li>Use a readstream on CSV file for import</li>
</ul>