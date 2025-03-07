const axios = require("axios");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
require("dotenv").config();

const MAX_FILE_SIZE = 0.001 * 1024 * 1024;
const MIN_HBAR_BALANCE = 1000;

let currentFileNumber = 1;
let currentFileSize = 0;
let firstWrite = true;
let fileStream = null;
let filePath = "";

function getNewFilePath(fileNumber) {
  return path.join(`${__dirname}/data`, `address-${fileNumber}.txt`);
}

async function initializeNewFile() {
  try {
    filePath = getNewFilePath(currentFileNumber);
    await fsPromises.writeFile(filePath, "[\n", "utf8");

    firstWrite = true;
    currentFileSize = 2;
    console.log(`Created new file: ${filePath}`);
  } catch (error) {
    console.error("Error initializing new file:", error.message);
    throw error;
  }
}

async function appendToFile(data) {
  try {
    if (!filePath) {
      await initializeNewFile();
    }

    const dataString = JSON.stringify(data, null, 2);
    const dataSize = Buffer.byteLength(dataString, "utf8");
    const commaSize = firstWrite ? 0 : 2;

    if (currentFileSize + dataSize + commaSize + 2 > MAX_FILE_SIZE) {
      await fsPromises.appendFile(filePath, "\n]", "utf8");
      console.log(`Closed file: ${filePath}`);

      currentFileNumber++;
      await initializeNewFile();
    }

    const prefix = firstWrite ? "" : ",\n";
    await fsPromises.appendFile(filePath, prefix + dataString, "utf8");

    currentFileSize += dataSize + commaSize;
    firstWrite = false;

    console.log(`Data appended successfully to ${filePath}`);
  } catch (error) {
    console.error(`Error appending to ${filePath}:`, error.message);
  }
}

async function getAllAccountBalances(limit = 100) {
  try {
    const baseUrl = "https://mainnet-public.mirrornode.hedera.com";
    let nextLink = `${baseUrl}/api/v1/accounts?limit=${limit}&order=desc`;
    let scrapedAll = false;

    while (nextLink && !scrapedAll) {
      console.log(`Fetching from: ${nextLink}`);
      const response = await axios.get(nextLink);
      const { data } = response;
      const accounts = data.accounts;

      if (!accounts || !Array.isArray(accounts)) {
        throw new Error("Invalid response format: missing accounts array");
      }

      if (accounts.length === 0) {
        console.log("No more accounts to fetch. Stopping.");
        scrapedAll = true;
        break;
      }

      for (const account of accounts) {
        const accountId = account.account;
        const balance = account.balance.balance / 100000000;
        const info = { account: accountId, balance: balance };

        if (balance >= MIN_HBAR_BALANCE) {
          await appendToFile(info);
          console.log(
            `Address ${accountId} with balance ${balance} HBAR meets the requirement and saved.`
          );
        } else {
          console.log(
            `Address ${accountId} with balance ${balance} HBAR does not meet the requirement.`
          );
        }
      }

      nextLink =
        data.links && typeof data.links.next === "string"
          ? `${baseUrl}${data.links.next}`
          : null;

      console.log(`Next Link: ${nextLink}`);

      if (!nextLink) {
        console.log("No more pages. Finished scraping.");
        scrapedAll = true;
      }
    }

    await fsPromises.appendFile(filePath, "\n]", "utf8");

    console.log("Finished scraping all available accounts.");
  } catch (error) {
    console.error("Error fetching account balances:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error(
        "Response data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw error;
  }
}

async function main() {
  try {
    await initializeNewFile();
    await getAllAccountBalances();
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
}

main();


