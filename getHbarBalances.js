const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
require("dotenv").config();

const ADDRESS_FILE = path.join(__dirname, "address.txt");
const MIN_HBAR_BALANCE = 1000;

async function initializeFiles() {
  try {
    await fs.writeFile(ADDRESS_FILE, "[]", { flag: "w" });
    console.log("Successfully initialized address.txt");
  } catch (error) {
    console.error("Error initializing files:", error.message);
    throw error;
  }
}

async function appendToFile(filePath, data) {
  try {
    const existingData = await fs.readFile(filePath, "utf8");
    const jsonArray = existingData ? JSON.parse(existingData) : [];

    jsonArray.push(data);

    const updatedData = JSON.stringify(jsonArray, null, 2);

    await fs.writeFile(filePath, updatedData, "utf8");
  } catch (error) {
    console.error(`Error appending to ${filePath}:`, error.message);
    throw error;
  }
}

async function getAllAccountBalances(limit = 100) {
  try {
    const baseUrl = "https://mainnet-public.mirrornode.hedera.com";
    let nextLink = `${baseUrl}/api/v1/accounts?limit=${limit}&order=desc`;
    let scrapedAll = false;
    var links = nextLink;
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
          await appendToFile(ADDRESS_FILE, info);
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
