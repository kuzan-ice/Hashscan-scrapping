const axios = require("axios");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
require("dotenv").config();

const ADDRESS_FILE = path.join(__dirname, "address.txt");
const MAX_FILE_SIZE = 7.5 * 1024 * 1024; // 7.5 MB
const MIN_HBAR_BALANCE = 1000;
let currentFileNumber = 1;
let currentFileSize = 0;

async function initializeFiles() {
  try {
    const filePath = getNewFilePath(currentFileNumber);
    await fsPromises.writeFile(filePath, "[]", { flag: "w" });
    console.log(`Successfully initialized ${filePath}`);
  } catch (error) {
    console.error("Error initializing files:", error.message);
    throw error;
  }
}

async function appendToFile(filePath, data) {
  try {
    const dataSize = Buffer.byteLength(JSON.stringify(data), "utf8") + 2; // +2 for newline and comma

    if (currentFileSize + dataSize > MAX_FILE_SIZE) {
      // Start a new file
      currentFileNumber++;
      currentFileSize = 0;
      filePath = getNewFilePath(currentFileNumber);
      await fsPromises.writeFile(filePath, "[", "utf8"); // Initialize new file with opening bracket
    }

    const fileStream = fs.createWriteStream(filePath, {
      flags: "a", // Append mode
    });

    if (currentFileSize === 0) {
      // First write to the file, include the opening bracket (already handled above)
    }

    await new Promise((resolve, reject) => {
      fileStream.write(
        JSON.stringify(data) + (currentFileSize === 0 ? "" : ",") + "\n"
      );
      fileStream.end();
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    currentFileSize += dataSize;

    console.log(`Data appended successfully to ${filePath}.`);
  } catch (error) {
    console.error(`Error appending to ${filePath}:`, error.message);
    throw error;
  }
}

function getNewFilePath(fileNumber) {
  return path.join(__dirname, `address-${fileNumber}.txt`);
}

async function getAllAccountBalances(limit = 100) {
  try {
    const baseUrl = "https://mainnet-public.mirrornode.hedera.com";
    let nextLink = `${baseUrl}/api/v1/accounts?limit=${limit}&order=desc`;
    let scrapedAll = false;
    var links = nextLink;
    let filePath = getNewFilePath(currentFileNumber);

    while (nextLink && !scrapedAll) {
      console.log(`Fetching from: ${nextLink}`);
      const response = await axios.get(nextLink);
      const { data } = response;
      const accounts = data.accounts;
      links = data.links;

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

        const info = {
          account: accountId,
          balance: balance,
        };

        if (balance >= MIN_HBAR_BALANCE) {
          await appendToFile(filePath, info);
          console.log(
            `Address ${accountId} with balance ${balance} HBAR meets the requirement and saved.`
          );
        } else {
          console.log(
            `Address ${accountId} with balance ${balance} HBAR does not meet the requirement.`
          );
        }
      }
      console.log(links);
      nextLink = links && links.next ? `${baseUrl}${links.next}` : null;
      console.log(nextLink);
      if (!nextLink) {
        console.log("No more pages. Finished scraping.");
        scrapedAll = true;

        // Close the last file with a closing bracket
        await fsPromises.appendFile(filePath, "]");
      }
    }

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
    await initializeFiles();
    await getAllAccountBalances();
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
}

main();
