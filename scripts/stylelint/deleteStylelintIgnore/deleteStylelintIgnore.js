'use strict';

// packages
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');
const glob = require('glob');
const stylelint = require('stylelint');

// helpers
const { isFileExists } = require('../../helpers/isFileExists/isFileExists');

/**
 * Функция считает количество ошибок stylelint в файлах которые попадают под паттерны в .stylelintignore
 * @param {Object} stylelintConfigContent
 * @param {set<string>} stylelintIgnoreFiles
 * @returns {Promise<number>}
 */
const getStylelintCountErrors = async function (
	stylelintConfigContent,
	stylelintIgnoreFiles
) {
	await fs.rename('.stylelintignore', 'hash');

	const stylelintResult = (
		await stylelint.lint({
			config: stylelintConfigContent,
			files: Array.from(stylelintIgnoreFiles),
			allowEmptyInput: true,
		})
	).results;

	await fs.rename('hash', '.stylelintignore');

	return stylelintResult.reduce((acc, file) => {
		acc += file.warnings.reduce(
			(acc, { severity }) => (severity === 'error' ? acc + 1 : acc),
			0
		);

		return acc;
	}, 0);
};

/**
 * Функция возвращает контент файла .stylelintrc
 * @param {string}
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
		console.error(`Error: reading stylelint config file - ${e}`);
	}
};

/**
 * Функция возвращает все файлы подходящие под паттерны из .stylelintignore
 * @param {string} stylelintIgnoreFilePath
 * @returns {Promise<set<string>>}
 */
const getStylelintIgnoreContent = async function (stylelintIgnoreFilePath) {
	try {
		await isFileExists(stylelintIgnoreFilePath);
		const stylelintIgnoreFiles = new Set();

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

			files.forEach((file) => stylelintIgnoreFiles.add(file));
		}

		return stylelintIgnoreFiles;
	} catch (e) {
		console.error(`Error: reading stylelint ignore file - ${e}`);
	}
};

/**
 * Функция удаляет файлы из исходной колекции содержащие комментарий stylelint-disable
 * @param {set<string>} stylelintIgnoreFiles
 * @returns {Promise<void>}
 */
const filterFilesWithDisableComment = async function (stylelintIgnoreFiles) {
	try {
		for (const file of stylelintIgnoreFiles) {
			let skipFile = false;
			const reader = readline.createInterface({
				input: fs.createReadStream(file),
			});

			for await (const line of reader) {
				if (line.trim() === '') continue;

				if (line.trim().match(/^\/\*\s*stylelint-disable\s*\*\/$/)) {
					skipFile = true;
				}

				break;
			}

			if (skipFile) {
				stylelintIgnoreFiles.delete(file);
			}
		}
	} catch (e) {
		console.error(
			`Error: filtering from files containing a stylelint-disable comment - ${e}`
		);
	}
};

/**
 * Функция добавляет комментарии в файлы стилей из файла .stylelintignore
 * @param {set<string>} stylelintIgnoreFiles
 * @param {string} stylelintIgnoreFilePath
 * @param {Object} stylelintConfigContent
 * @returns {Promise<void>}
 */
const addingCommentsWithStylelintErrors = async function (
	stylelintIgnoreFiles,
	stylelintIgnoreFilePath,
	stylelintConfigContent,
	useStylelintDisableComments = false
) {
	try {
		// helpers

		/**
		 * Хелпер читает файл и преобразует вывод в массив строк
		 * @param {string} pathSourceFile
		 * @returns {Promise<string[]>}
		 */
		const helperReadSourceFile = async function (pathSourceFile) {
			const sourceCodeFile = await fs.readFile(pathSourceFile, 'utf-8');
			return sourceCodeFile.split('\n');
		};

		/**
		 * Хелпер записывает файл из массива строк или же из строки
		 * @param {string} pathSourceFile
		 * @param {string[] | string} data
		 * @return {Promise<Void>}
		 */
		const helperWriteSourceFile = async function (pathSourceFile, data) {
			let dataFile = data;
			if (Array.isArray(data)) {
				dataFile = data.join('\n');
			}

			await fs.writeFile(pathSourceFile, dataFile, { flag: 'w' });
		};

		/**
		 * Хелпер преобразует массив предупреждений в коллекцию файлов в которых есть ошибки
		 * @param {[]} warningsArray
		 * @returns {map<string, set<string>>}
		 */
		const helperCollectionFilesErrorsFromWarningsArray = function (
			warningsArray
		) {
			return warningsArray.reduce(
				(acc, { severity, line, endLine, rule }) => {
					const isWarning = severity !== 'error';
					if (isWarning) {
						return acc;
					}

					const key = `${line}|${endLine}`;

					if (!acc.has(key)) {
						acc.set(key, new Set());
					}

					acc.get(key).add(rule);

					return acc;
				},
				new Map()
			);
		};

		/**
		 * Хелпер преобразует коллекцию файлов в которых найдены ошибки в отсортированный массив entries
		 * @param {map<string, set<string>>} collectionFilesErrors
		 * @returns {[string, set<string>][]}
		 */
		const helperSortedEntiresFromCollectionFilesErrors = function (
			collectionFilesErrors
		) {
			const sortedEntriesFilesErrors = Array.from(
				collectionFilesErrors.entries()
			);
			sortedEntriesFilesErrors.sort((array1, array2) => {
				const [line1] = array1;
				const [line2] = array2;

				const startLine1 = Number(line1.split('|')[0]);
				const startLine2 = Number(line2.split('|')[0]);

				return startLine1 - startLine2;
			});

			return sortedEntriesFilesErrors;
		};

		/**
		 * Хелпер преобразовывает Set правил stylelint в комментарий
		 * @param {set<string>} rules
		 * @param {string} commentType
		 * @returns {string | Object}
		 */
		const helperCommentDisableFromArrayRules = function (
			rules,
			commentType
		) {
			const rulesstring = Array.from(rules).join(',');
			return `/* stylelint-${commentType} ${rulesstring} */`;
		};

		// source code

		await fs.rename('.stylelintignore', 'hash');

		const stylelintResults = (
			await stylelint.lint({
				config: stylelintConfigContent,
				files: [...stylelintIgnoreFiles],
				allowEmptyInput: true,
			})
		).results;

		await fs.rename('hash', '.stylelintignore');

		for (const file of stylelintResults) {
			const isFileNotContainError = !file.errored;
			if (isFileNotContainError) {
				continue;
			}

			const sourceCodeFile = await helperReadSourceFile(file.source);
			const collectionFilesErrors =
				helperCollectionFilesErrorsFromWarningsArray(file.warnings);
			const sortedEntriesFilesErrors =
				helperSortedEntiresFromCollectionFilesErrors(
					collectionFilesErrors
				);

			let counterInsertionLines = 0;

			for (const [lines, rules] of sortedEntriesFilesErrors) {
				const startLine = Number(lines.split('|')[0]);
				const endLine = Number(lines.split('|')[1]);

				if (useStylelintDisableComments) {
					const indexDisableComment =
						startLine - 1 + counterInsertionLines;
					const disableComment = helperCommentDisableFromArrayRules(
						rules,
						'disable'
					);

					const indexEnableComment =
						endLine + 1 + counterInsertionLines;
					const enableComment = helperCommentDisableFromArrayRules(
						rules,
						'enable'
					);

					sourceCodeFile.splice(
						indexDisableComment,
						0,
						disableComment
					);

					sourceCodeFile.splice(indexEnableComment, 0, enableComment);
					counterInsertionLines += 2;

					continue;
				}

				const indexDisableNextLineComment =
					startLine - 1 + counterInsertionLines;
				const disableNextLineComment =
					helperCommentDisableFromArrayRules(
						rules,
						'disable-next-line'
					);

				sourceCodeFile.splice(
					indexDisableNextLineComment,
					0,
					disableNextLineComment
				);
				counterInsertionLines += 1;
			}

			await helperWriteSourceFile(file.source, sourceCodeFile);
			await helperWriteSourceFile(stylelintIgnoreFilePath, '');
		}
	} catch (e) {
		await fs.rename('hash', '.stylelintignore');
		console.error(`Error: adding comments to style files - ${e}`);
	}
};

/**
 * Функция удаляет содержимое файла .stylelintignore и добавляет комментарии отключающие проверки stylelint в файлы стилей
 * @param {strint} baseUrl
 * @returns {Promise<void>}
 */
const deleteStylelintIgnore = async function (baseUrl) {
	console.log('Start delete .stylelintignore script...');

	const stylelintIgnoreFilePath = path.join(baseUrl, '.stylelintignore');
	const stylelintConfigFilePath = path.join(baseUrl, '.stylelintrc.json');

	const stylelintConfigContent = await getStylelintConfigContent(
		stylelintConfigFilePath
	);
	const stylelintIgnoreFiles = await getStylelintIgnoreContent(
		stylelintIgnoreFilePath
	);

	console.log(
		`Total errors stylelint previous: ${await getStylelintCountErrors(
			stylelintConfigContent,
			stylelintIgnoreFiles
		)}`
	);

	await filterFilesWithDisableComment(stylelintIgnoreFiles);
	await addingCommentsWithStylelintErrors(
		stylelintIgnoreFiles,
		stylelintIgnoreFilePath,
		stylelintConfigContent,
		true
	);

	console.log(
		`Total errors stylelint current: ${await getStylelintCountErrors(
			stylelintConfigContent,
			stylelintIgnoreFiles
		)} ☹️`
	);
};

const baseUrl = '.';
deleteStylelintIgnore(baseUrl);
