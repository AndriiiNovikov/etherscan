import fs from 'fs';

const { addresses, apiKey, startDate, endDate, tempDir, apiReserved, hashCurrency, addressStop } = JSON.parse(fs.readFileSync('config.json').toString());

let resArray = []; // result json
let text = []; // result csv


function getBlockNumberByDate(date) {
	// returns the nearest blockNumber to given date
	return new Promise((resolve, reject) => {
		const dateSplit = date.split('-');
		let timestamp = new Date(dateSplit[0], dateSplit[1] - 1, dateSplit[2]).getTime().toString();
		timestamp = timestamp.slice(0, timestamp.length - 3);

		fetch(`https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before&apikey=${apiKey}`).then(response => {
			response.json().then(result => {
				if (result.message === 'OK') resolve(result.result);
			});
		}).catch(rejected => {
			fetch(`https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before&apikey=${apiKey}`).then(response => {
				response.json().then(result => {
					if (result.message === 'OK') resolve(result.result);
				});
			})
		});
	});
}

function hexToDecimal(hex, hash) {
	// converts hex numbers into decimal
	return parseInt(hex, 16) / Math.pow(10, hash == '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' ? 18 : 6);
}

function toUsd(eth, hash = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') {
	// converts any currency to usd (from config.json)
	return eth * hashCurrency[hash];
}

getBlockNumberByDate(startDate).then(_startBlock => {
	getBlockNumberByDate(endDate).then(_endBlock => {
		const startBlock = _startBlock;
		const endBlock = _endBlock;

		function fetchAddress(address) {
			// fetchs all transactions by given address and writes them into `transactions` array
			return new Promise((resolve, reject) => {
				let transactions = [];

				let counter = 1; // DEBUG
				fetch(`https://api.etherscan.io/api?module=account&action=txlist&address=${address}&endblock=${endBlock}&sort=desc&apikey=${apiKey}`).then(response => {
					response.json().then(result => {
						let endBlockTemp = result.result[0].blockNumber;

						// fetchs block of transactions (api gives only 10000 transactions per time)
						function fetchBlock(startBlock, index = 1) {
							return new Promise((resolve, reject) => {
								if (fs.existsSync(`./cache/${address}-basic.json`)) {
									transactions = JSON.parse(fs.readFileSync(`./cache/${address}-basic.json`).toString());
									resolve();
								} else {
									// fetching last block by date in THIS address
									fetch(`https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=${endBlockTemp}&sort=asc&apikey=${apiKey}`).then(response => {
										response.json().then(result => {
											if (result.message === 'OK') {
												transactions = transactions.concat(result.result.map(item => {
													// console.log(`Basic fetching: ${counter}/${index} (${address}), ${new Date(parseInt(item.timeStamp + '000'))}`); // DEBUG
													return { id: counter++, address: item.to, date: parseInt(item.timeStamp), block: item.blockNumber, hash: item.hash }
												}));

												// if block numbers are not the same function calls itself with next page request
												if (result.result[result.result.length - 1].blockNumber != endBlockTemp)
													fetchBlock((parseInt(result.result[result.result.length - 1].blockNumber) + 1).toString(), ++index).then(() => resolve());
												else resolve();
											}
										});
									}).catch(rejected => {
										fetchBlock(startBlock, index).then(() => resolve());
									});
								}
							});
						}

						let debug = 0; // DEBUG

						fetchBlock(startBlock).then(() => {
							let hashes = [];

							// caching previous step
							if (!fs.existsSync('./cache')) fs.mkdirSync('./cache');
							fs.writeFileSync(`./cache/${address}-basic.json`, JSON.stringify(transactions));

							// looking for pairs of transactions
							for (let i = 0; i < transactions.length - 1; i++) {
								// console.log(`Looking for couples: ${i + 1}/${transactions.length - 1} (${address})`); // DEBUG
								if (transactions[i].block == transactions[i + 1].block) {
									hashes.push([transactions[i].hash, transactions[i + 1].hash, transactions[i].date, transactions[i].address]);
									i++;
								}
							}

							// slicing hashes (RAM can afford only near 20000)
							const startIndex = process.argv[2];
							const endIndex = ((process.argv[3] - hashes.length) < (process.argv[3] - process.argv[2])) && (process.argv[3] > hashes.length) ? hashes.length : process.argv[3];
							hashes = hashes.slice(startIndex, endIndex);

							if (hashes.length > 0) {
								function fetchHash(index, slice, apiKey) {
									// fetches the block of hashes

									let hashesSlice = hashes.slice(slice[0], slice[1]);

									return new Promise((resolve, reject) => {
										debug++; // DEBUG

										fetch(`https://api.etherscan.io/api?module=proxy&action=eth_getTransactionReceipt&txhash=${hashesSlice[index][0]}&apikey=${apiKey}`).then(response => {
											response.json().then(log1 => {
												fetch(`https://api.etherscan.io/api?module=proxy&action=eth_getTransactionReceipt&txhash=${hashesSlice[index][1]}&apikey=${apiKey}`).then(response => {
													response.json().then(log2 => {
														// fetching two transactions (log1, log2)
														try {
															const fee = toUsd(parseInt(log1.result.gasUsed, 16) * parseInt(log1.result.effectiveGasPrice, 16) / Math.pow(10, 18) + parseInt(log2.result.gasUsed, 16) * parseInt(log2.result.effectiveGasPrice, 16) / Math.pow(10, 18));
															let revenue = 0;

															function fetchCrypto(hash) {
																// calculates revenue from two transactions

																let innerLog1 = log1.result.logs.filter(item => item.address == hash);
																let innerLog2 = log2.result.logs.filter(item => item.address == hash);

																if (innerLog1.length == innerLog2.length && innerLog1.length > 0) {
																	let localRevenue = [];

																	innerLog1.forEach(transaction => {
																		const logIndex = innerLog2.findIndex(item => item.topics[1] == transaction.topics[2] && item.topics[2] == transaction.topics[1]);
																		if (~logIndex) {
																			localRevenue.push(Math.abs(hexToDecimal(transaction.data, hash) - hexToDecimal(innerLog2[logIndex].data, hash)));
																		}
																	});

																	revenue += toUsd(localRevenue.reduce((sum, a) => sum + a, 0), hash);
																}
															}

															// looking for all possible tokens (config.json)
															for (let i = 0; i < Object.keys(hashCurrency).length; i++) {
																fetchCrypto(Object.keys(hashCurrency)[i]);
															}

															let stop = addressStop[address] ? addressStop[address] : 50;

															if (revenue < stop && revenue != 0) {
																// resArray.push({ startHash: hashesSlice[index][0], endHash: hashesSlice[index][1], profit: revenue - fee, cost: fee, revenue: revenue }); // DEBUG
																// text += `${hashesSlice[index][0]},${hashesSlice[index][1]},${revenue - fee},${fee},${revenue}\r\n`; // DEBUG
																console.log(hashesSlice[index])
																// writing into files
																resArray.push({date: hashesSlice[index][2], address: hashesSlice[index][3], profit: revenue - fee, cost: fee, revenue: revenue});
																text += `${hashesSlice[index][2]},${hashesSlice[index][3]},${revenue - fee},${fee},${revenue}\r\n`;
																fs.writeFileSync(`${tempDir}/${address}-${startIndex}:${endIndex}.json`, JSON.stringify(resArray));
																fs.writeFileSync(`${tempDir}/${address}-${startIndex}:${endIndex}.csv`, text);
															}
														} catch (e) { }

														setTimeout(() => {
															if (index < hashesSlice.length - 1) fetchHash(++index, slice, apiKey).then(() => resolve());
															else resolve();
														}, 200);
													});
												}).catch(rejected => {
													debug--; fetchHash(index, slice, apiKey).then(() => resolve());
													console.log(rejected);
												});
											});
										}).catch(rejected => {
											debug--; fetchHash(index, slice, apiKey).then(() => resolve());
											console.log(rejected);
										});
									});
								}

								if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

								// running fetchHash for all api keys (config.json)
								apiReserved.forEach((apiKey, index) => {
									fetchHash(0, [Math.ceil((hashes.length / apiReserved.length) * (index)), Math.ceil((hashes.length / apiReserved.length) * (index + 1))], apiKey).then(() => {
										clearInterval(debugInterval);
									});

									const debugInterval = setInterval(() => {
										console.log(`Fetching transaction details: ${debug}/${hashes.length}`); // DEBUG
									}, 200);
								});
							}
						});
					});
				}).catch(rejected => {
					fetchAddress(address);
					console.log(rejected);
				});
			});
		}

		addresses.forEach(address => {
			fetchAddress(address);
		});
	});
});
