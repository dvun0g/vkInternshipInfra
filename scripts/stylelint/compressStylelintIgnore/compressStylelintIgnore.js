'use strict';

// packages
const glob = require('glob');
const fs = require('fs-extra');
const readline = require('readline');
const path = require('path');
const stylelint = require('stylelint');

// helpers
const { isFileExists } = require('../../helpers/isFileExists/isFileExists');
const {
	determinateSizeAndLengthFile,
} = require('../../helpers/determinateSizeAndLengthFile/determinateSizeAndLengthFile');

/**
 * Функция возвращает контент файла .stylelintrc
 * @param {String}
 * @returns {Promise<Object>}
 */
const getStylelintConfigContent = async function (stylelintFilePath) {
	try {
		await isFileExists(stylelintFilePath);
		const stylelintContent = JSON.parse(
			await fs.readFile(stylelintFilePath, 'utf-8')
		);

		return stylelintContent;
	} catch (e) {
		console.error(`Error: reading stylelint config file - ${e.message()}`);
	}
};

/**
 * Функция возвращает контент и все файлы из .stylelintignore
 * @param {String} stylelintIgnoreFilePath
 * @returns {Promise<Map<String, Set<String>>>}
 */
const getStylelintIgnoreContent = async function (stylelintIgnoreFilePath) {
	try {
		await isFileExists(stylelintIgnoreFilePath);
		const stylelintIgnoreCollection = new Map();

		const reader = readline.createInterface({
			input: fs.createReadStream(stylelintIgnoreFilePath),
			crlfDelay: Infinity,
		});

		for await (const line of reader) {
			const isEmptyLine = line.trim().length === 0;
			const isCommentLine = line.trim().length && line.trim()[0] === '#';

			if (isEmptyLine || isCommentLine) {
				continue;
			}

			const isNotSingleFileLine = !line.endsWith('.css');
			let pattern = line;
			if (isNotSingleFileLine) {
				pattern = `${line}**/*.css`;
			}

			const files = glob.sync(pattern);
			const isEmptyFolder = files.length === 0;
			if (isEmptyFolder) {
				continue;
			}

			stylelintIgnoreCollection.set(line, new Set(files));
		}

		return stylelintIgnoreCollection;
	} catch (e) {
		console.error(`Error: reading stylelint ignore file - ${e}`);
	}
};

/**
 * Функция удаляет файлы из исходной колекции содержащие комментарий stylelint-disable
 * @param {Map<String, Set<String>>} stylelintIgnoreCollection
 * @returns {Promise<Void>}
 */
const filterFilesWithDisableComment = async function (
	stylelintIgnoreCollection
) {
	try {
		for (const [line, files] of stylelintIgnoreCollection.entries()) {
			for (const file of files) {
				let skipFile = false;
				const reader = readline.createInterface({
					input: fs.createReadStream(file),
				});

				for await (const line of reader) {
					if (line.trim() === '') continue;

					if (
						line.trim().match(/^\/\*\s*stylelint-disable\s*\*\/$/)
					) {
						skipFile = true;
					}

					break;
				}

				if (skipFile) {
					files.delete(file);
				}
			}

			if (files.size === 0) {
				stylelintIgnoreCollection.delete(line);
			}
		}
	} catch (e) {
		console.error(
			`Error: filtering from files containing a stylelint-disable comment - ${e}`
		);
	}
};

/**
 * Функция удаляет из исходной колекции файлы не содержащие ошибок stylelint
 * @param {Map<String, Set<String>>} stylelintIgnoreCollection
 * @param {Object} stylelintConfigContent
 * @returns {Promise<Void>}
 */
const filterFilesWithoutErrors = async function (
	stylelintIgnoreCollection,
	stylelintConfigContent
) {
	try {
		for (const [line, files] of stylelintIgnoreCollection.entries()) {
			// Не смог найти другой способ проигнорировать файл .stylelintignore при выполнение stylelint.lint
			await fs.rename('.stylelintignore', 'hash');

			const stylelintResults = (
				await stylelint.lint({
					config: stylelintConfigContent,
					files: [...files],
					allowEmptyInput: true,
				})
			).results;

			await fs.rename('hash', '.stylelintignore');

			for (const file of stylelintResults) {
				const isFileNotContainError = !file.errored;
				if (isFileNotContainError) {
					files.delete(file);
				}
			}

			if (files.size === 0) {
				stylelintIgnoreCollection.delete(line);
			}
		}
	} catch (e) {
		await fs.rename('hash', '.stylelintignore');
		console.error(
			`Error: filtering from files that do not contain errors - ${e}`
		);
	}
};

/**
 * Функция записывает новый файл .stylelintignore
 * @param {String} stylelintIgnoreFilePath
 * @param {Map<String, Set<String>>} stylelintIgnoreCollection
 * @returns {Promise<Void>}
 */
const writeNewStylelintIgnore = async function (
	stylelintIgnoreFilePath,
	stylelintIgnoreCollection
) {
	try {
		let newStylelintIgnoreContent = '';
		for (const [line, files] of stylelintIgnoreCollection.entries()) {
			if (files.size) {
				newStylelintIgnoreContent += `${line}\n`;
			}
		}

		await fs.writeFile(stylelintIgnoreFilePath, newStylelintIgnoreContent, {
			flag: 'w',
		});
	} catch (e) {
		console.error(`Error: writing a file .stylelintignore - ${e}`);
	}
};

/**
 * Функция сжимает .stylelintignore
 * @param {String} baseUrl
 * @returns {Promise<Void>}
 */
const compressStylelintIgnore = async function (baseUrl) {
	console.log('Start compress .stylelintignore script...');

	const stylelintIgnoreFilePath = path.join(baseUrl, '.stylelintignore');
	const stylelintConfigFilePath = path.join(baseUrl, '.stylelintrc.json');

	const { size: initialSize, length: initialLength } =
		await determinateSizeAndLengthFile(stylelintIgnoreFilePath);
	console.log(
		`Total file size: ${initialSize} bytes\nTotal lines in the file: ${initialLength}`
	);

	const stylelintConfigContent = await getStylelintConfigContent(
		stylelintConfigFilePath
	);
	const stylelintIgnoreCollection = await getStylelintIgnoreContent(
		stylelintIgnoreFilePath
	);
	await filterFilesWithDisableComment(stylelintIgnoreCollection);
	await filterFilesWithoutErrors(
		stylelintIgnoreCollection,
		stylelintConfigContent
	);
	await writeNewStylelintIgnore(
		stylelintIgnoreFilePath,
		stylelintIgnoreCollection
	);

	console.log('Success');
	const { size: resultSize, length: resultLength } =
		await determinateSizeAndLengthFile(stylelintIgnoreFilePath);
	console.log(
		`Total file size: ${resultSize} bytes\nTotal lines in the file: ${resultLength}`
	);
};

const baseUrl = '.';
compressStylelintIgnore(baseUrl);
