'use strict';

// packages
const fs = require('fs-extra');

// helpers
const { isFileExists } = require('../isFileExists/isFileExists');

/**
 * Функция определяет длину и размер файла
 * @param {String} filePath
 * @returns {Promise<Object>}
 */
const determinateSizeAndLengthFile = async function (filePath) {
	try {
		await isFileExists(filePath);
		const size = (await fs.stat(filePath)).size;
		const length = (await fs.readFile(filePath, 'utf-8')).split(
			'\n'
		).length;

		return {
			size,
			length,
		};
	} catch (e) {
		console.error(
			`Error: file size and length definitions ${filePath} - ${e}`
		);
	}
};

module.exports = {
	determinateSizeAndLengthFile,
};
