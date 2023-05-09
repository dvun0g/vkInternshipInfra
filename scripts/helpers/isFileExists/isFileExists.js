'use strict';

const fs = require('fs-extra');

/**
 * Синхронная функция проверяет существования файла
 * @param {String} filePath Путь к файлу
 * @returns {Error | Boolean}
 */
const isFileExistsSync = function (filePath) {
	const result = fs.pathExistsSync(filePath);

	if (!result) {
		throw new Error(`There is no file on this path - ${filePath}`);
	}

	return result;
};

/**
 * Асинхронная функция проверяет существования файла
 * @param {String} filePath Путь к файлу
 * @returns {Promise<Error | Boolean>}
 */
const isFileExists = async function (filePath) {
	const result = await fs.pathExists(filePath);

	if (!result) {
		throw new Error(`There is no file on this path - ${filePath}`);
	}

	return result;
};

module.exports = {
	isFileExistsSync,
	isFileExists,
};
