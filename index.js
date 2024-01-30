const { DydxMarket } = require("@dydxprotocol/starkex-lib");
const { DydxClient, Market } = require("@dydxprotocol/v3-client");
const { Bot, Context, session, InlineKeyboard, InputFile } = require("grammy");
const Web3 = require("web3");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const log4js = require("./config/log4js");
const logger = log4js.getLogger("app");
const moment = require("moment-timezone");
const XLSX = require("xlsx");
const path = require("path");
require("dotenv").config();

const HTTP_HOST = "https://api.dydx.exchange";

const app = express();

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Install session middleware and set initial session values
bot.use(session({ initial }));

// Define the initial session values
function initial() {
  return {
    settingUpAccount: {},
  };
}

async function saveToJsonFile(filename, data) {
  try {
    // Convert data to a JSON string with indentation for better readability
    const jsonData = JSON.stringify(data, null, 2);

    // Write the JSON string to the file
    await fs.promises.writeFile(filename, jsonData);

    console.log(`Data saved to ${filename}`);
  } catch (error) {
    console.error(`Error saving data to ${filename}:`, error);
  }
}

let accounts = loadAccounts();

function loadAccounts() {
  try {
    const data = fs.readFileSync("accounts.json");
    return JSON.parse(data);
  } catch (error) {
    // If the file doesn't exist or is invalid, return an empty object
    return {};
  }
}

function saveAccounts() {
  fs.writeFileSync("accounts.json", JSON.stringify(accounts, null, 2));
}

async function updateAccountsMessage(ctx) {
  const userId = ctx.from.id;
  const userAccounts = accounts[userId];

  if (!userAccounts) {
    return; // No accounts saved
  }

  const accountsMenu = new InlineKeyboard();

  for (const accountKey in userAccounts) {
    const account = userAccounts[accountKey];
    const isSelected =
      ctx.session.selectedAccount &&
      ctx.session.selectedAccount.accountKey === accountKey;

    const truncatedAddress = `${account.address.slice(
      0,
      4
    )}...${account.address.slice(-4)}`;
    const accountText = isSelected
      ? `✅ Account ${account.name} (${truncatedAddress})`
      : `Account ${account.name} (${truncatedAddress})`;

    accountsMenu.text(accountText, `getaccount_${accountKey}`);
  }

  accountsMenu.row().text("Add New Account", "addnewaccount");
  const messageId = ctx.callbackQuery.message.message_id;
  if (
    ctx.session.selectedAccount &&
    ctx.session.selectedAccount.messageId === messageId
  ) {
    return;
  }

  let userDetails = "";
  if (ctx.session.selectedAccount.user.email) {
    userDetails += `email: ${ctx.session.selectedAccount.user.email}\n`;
  }
  if (ctx.session.selectedAccount.user.username) {
    userDetails += `username: ${ctx.session.selectedAccount.user.username}\n`;
  }
  if (ctx.session.selectedAccount.user.makerFeeRate) {
    userDetails += `makerFeeRate: ${ctx.session.selectedAccount.user.makerFeeRate}\n`;
  }
  if (ctx.session.selectedAccount.user.takerFeeRate) {
    userDetails += `takerFeeRate: ${ctx.session.selectedAccount.user.takerFeeRate}\n`;
  }
  if (ctx.session.selectedAccount.user.fees30D) {
    userDetails += `fees30D: ${ctx.session.selectedAccount.user.fees30D}\n`;
  }
  if (ctx.session.selectedAccount.user.dydxTokenBalance) {
    userDetails += `dydxTokenBalance: ${ctx.session.selectedAccount.user.dydxTokenBalance}\n`;
  }
  if (ctx.session.selectedAccount.user.stakedDydxTokenBalance) {
    userDetails += `stakedDydxTokenBalance: ${ctx.session.selectedAccount.user.stakedDydxTokenBalance}\n`;
  }
  if (ctx.session.selectedAccount.user.activeStakedDydxTokenBalance) {
    userDetails += `activeStakedDydxTokenBalance: ${ctx.session.selectedAccount.user.activeStakedDydxTokenBalance}\n`;
  }
  const uniqueMessageText = `Selected Account: <b>${ctx.session.selectedAccount.address}</b>\nPublic ID: ${ctx.session.selectedAccount.user.publicId}\n${userDetails}\nYour saved accounts:\n`;

  // Edit the message with the updated accounts keyboard
  await ctx.editMessageText(uniqueMessageText, {
    reply_markup: accountsMenu,
    parse_mode: "HTML",
  });
}

bot.command("ping", async (ctx) => {
  const chatId = ctx.chat.id;
  const healthcheck = {
    uptime: process.uptime(),
    message: "OK",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: moment().format("DD-MM-YYYY HH:mm:ss"),
  };
  try {
    await ctx.reply(
      `<b>pong!</b>\n\nuptime: ${healthcheck.uptime}\nmessage: ${healthcheck.message}\ntimezone: ${healthcheck.timezone}\ntimestamp:  ${healthcheck.timestamp}`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    healthcheck.message = error;
    await ctx.reply(`pong: ${healthcheck.message}`);
  }
});

bot.command("setaccount", async (ctx) => {
  try {
    const userId = ctx.from.id;

    // Ensure 'settingUpAccount' is initialized in the session
    ctx.session.settingUpAccount = {
      userId,
      step: 1,
      accountName: "",
    };

    await ctx.reply("Please enter the account name:");
  } catch (error) {
    await ctx.reply(`Error setting account name: ${error.message}`);
  }
});

bot.command("accounts", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const userAccounts = accounts[userId];

    if (!userAccounts) {
      await ctx.reply(
        "No accounts saved. Use /setaccount to set your private key."
      );
    } else {
      const accountsMenu = new InlineKeyboard();

      for (const accountKey in userAccounts) {
        const account = userAccounts[accountKey];
        const isSelected =
          ctx.session.selectedAccount &&
          ctx.session.selectedAccount.accountKey === accountKey;

        const truncatedAddress = `${account.address.slice(
          0,
          4
        )}...${account.address.slice(-4)}`;

        const accountText = isSelected
          ? `✅ Account ${account.name} (${truncatedAddress})`
          : `Account ${account.name} (${truncatedAddress})`;

        accountsMenu.text(accountText, `getaccount_${accountKey}`);
      }

      accountsMenu.row().text("Add New Account", "addnewaccount");

      let uniqueMessageText = "";
      if (ctx.session.selectedAccount) {
        let userDetails = "";
        const selectedAccount = ctx.session.selectedAccount;
        if (selectedAccount.user) {
          if (selectedAccount.user.email) {
            userDetails += `email: ${selectedAccount.user.email}\n`;
          }
          if (selectedAccount.user.username) {
            userDetails += `username: ${selectedAccount.user.username}\n`;
          }
          if (selectedAccount.user.makerFeeRate) {
            userDetails += `makerFeeRate: ${selectedAccount.user.makerFeeRate}\n`;
          }
          if (selectedAccount.user.takerFeeRate) {
            userDetails += `takerFeeRate: ${selectedAccount.user.takerFeeRate}\n`;
          }
          if (selectedAccount.user.fees30D) {
            userDetails += `fees30D: ${selectedAccount.user.fees30D}\n`;
          }
          if (selectedAccount.user.dydxTokenBalance) {
            userDetails += `dydxTokenBalance: ${selectedAccount.user.dydxTokenBalance}\n`;
          }
          if (selectedAccount.user.stakedDydxTokenBalance) {
            userDetails += `stakedDydxTokenBalance: ${selectedAccount.user.stakedDydxTokenBalance}\n`;
          }
          if (selectedAccount.user.activeStakedDydxTokenBalance) {
            userDetails += `activeStakedDydxTokenBalance: ${selectedAccount.user.activeStakedDydxTokenBalance}\n`;
          }
        }
        uniqueMessageText = `Selected Account: <b>${selectedAccount.address}</b>\nPublic ID: ${selectedAccount.user.publicId}\n${userDetails}\nYour saved accounts:\n`;
      }

      await ctx.reply(
        uniqueMessageText ? uniqueMessageText : "Your saved accounts:",
        {
          reply_markup: accountsMenu,
          parse_mode: "HTML",
        }
      );
    }
  } catch (error) {
    await ctx.reply(`Error checking accounts: ${error.message}`);
  }
});

bot.command("dydxprivatemenus", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const userAccounts = accounts[userId];
    const selectedAccount = ctx.session.selectedAccount;
    if (!userAccounts) {
      await ctx.reply(
        "No accounts saved. Use /setaccount to set your private key."
      );
      return;
    }
    if (!selectedAccount) {
      await ctx.reply(
        "No selected account. Use /accounts to select your account"
      );
      return;
    }

    const dydxMenus = new InlineKeyboard();
    dydxMenus.text("Get Positions", `getposition`);
    dydxMenus.text("Get Transfers", "gettransfer");
    dydxMenus.row().text("Get Orders", "getorders");
    dydxMenus.text("Get Active Order", "getactiveorders");
    dydxMenus.row().text("Get Funding Payment", "getfundingpayment");
    dydxMenus.text("Get Accounts", "getaccounts");

    await ctx.reply("dYdX Private Menus:", {
      reply_markup: dydxMenus,
    });
  } catch (error) {
    await ctx.reply(`Error checking accounts: ${error.message}`);
  }
});

bot.command("dydxpublicmenus", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const dydxMenus = new InlineKeyboard();
    dydxMenus.text("Get Historical Funding", "gethistoricalfunding");
    dydxMenus.text("Get Markets", "getmarkets");

    await ctx.reply("dYdX Public Menus:", {
      reply_markup: dydxMenus,
    });
  } catch (error) {
    await ctx.reply(`Error checking accounts: ${error.message}`);
  }
});

bot.command("help", async (ctx) => {
  // Show help message
  const helpMessage = `
    <b>Available Commands:</b>
    /ping - Check the bot's health and uptime.
    /setaccount - Set up a new account.
    /accounts - View and manage your saved accounts.
    /dydxprivatemenus - View private information from dYdX.
    /dydxpublicmenus - View public information from dYdX.
    /help - Display this help message.
  `;

  await ctx.reply(helpMessage, { parse_mode: "HTML" });
});

bot.command("start", async (ctx) => {
  // Show help message
  const helpMessage = `
    <b>Available Commands:</b>
    /ping - Check the bot's health and uptime.
    /setaccount - Set up a new account.
    /accounts - View and manage your saved accounts.
    /dydxprivatemenus - View private information from dYdX.
    /dydxpublicmenus - View public information from dYdX.
    /help - Display this help message.
  `;

  await ctx.reply(helpMessage, { parse_mode: "HTML" });
});

bot.on("callback_query", async (ctx) => {
  const userId = ctx.from.id;
  const queryData = ctx.callbackQuery.data;

  try {
    const userAccounts = accounts[userId];

    if (queryData.startsWith("getaccount_")) {
      const accountKey = queryData.replace("getaccount_", "");
      const account = userAccounts[accountKey];

      if (account && account.name && account.privateKey) {
        // Mark the account as selected
        ctx.session.selectedAccount = {
          accountKey,
          name: account.name,
          privateKey: account.privateKey,
          address: account.address,
          user: account.user,
        };

        // Update the previous message

        await updateAccountsMessage(ctx);
      } else {
        // Account not found or missing necessary data
        await ctx.reply("Account not found.");
      }
    } else if (queryData === "addnewaccount") {
      // Ensure 'settingUpAccount' is initialized in the session
      ctx.session.settingUpAccount = {
        userId,
        step: 1,
        accountName: "",
      };

      await ctx.reply("Please enter the account name:");
    } else if (queryData === "gethistoricalfunding") {
      // Prompt the user to input the market symbol
      await ctx.reply("Please enter the market symbol (e.g., BTC-USD):");

      // Set the session state to indicate that the bot is awaiting the market symbol input
      ctx.session.awaitingMarketSymbol = true;
    } else if (queryData === "getmarkets") {
      const client = new DydxClient(HTTP_HOST);

      const { markets } = await client.public.getMarkets();
      if (markets) {
        // Convert markets object to an array of objects
        const marketsArray = Object.values(markets);

        const ws = XLSX.utils.json_to_sheet(marketsArray);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const xlsxFileName = `marketsdata_${timestamp}.xlsx`;

        // Define the directory path
        const userDirectory = path.join(__dirname, "data", userId.toString());

        // Ensure the directory exists, creating it if necessary
        if (!fs.existsSync(userDirectory)) {
          fs.mkdirSync(userDirectory, { recursive: true }); // Ensure parent directories are created if they don't exist
        }

        // Construct the file path
        const filePath = path.join(userDirectory, xlsxFileName);

        // Write the file to the specified directory
        XLSX.writeFile(wb, filePath);

        // Create a promise to wait for the file to be written
        const waitForFile = new Promise((resolve, reject) => {
          const checkFile = () => {
            if (fs.existsSync(filePath)) {
              resolve();
            } else {
              setTimeout(checkFile, 100); // Check again after a short delay
            }
          };
          checkFile();
        });

        // Wait for the file to be written before replying with the document
        waitForFile.then(() => {
          ctx.replyWithDocument(new InputFile(filePath), {
            caption: `Markets Data - ${timestamp}`,
          });
        });
      } else {
        ctx.reply("No markets data available.");
      }
    } else if (queryData === "getposition") {
      if (ctx.session.selectedAccount) {
        const web3 = new Web3();
        web3.eth.accounts.wallet.add(ctx.session.selectedAccount.privateKey);
        const address = web3.eth.accounts.wallet[0].address;
        // Confirm that the provided information is correct
        if (!address) {
          throw new Error("Invalid private key format");
        }
        const client = new DydxClient(HTTP_HOST, { web3 });
        const apiCreds = await client.onboarding.recoverDefaultApiCredentials(
          address
        );
        client.apiKeyCredentials = apiCreds;
        const { positions } = await client.private.getPositions();

        if (positions.length > 0) {
          const ws = XLSX.utils.json_to_sheet(positions);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const xlsxFileName = `positions_${timestamp}.xlsx`;

          // Define the directory path
          const userDirectory = path.join(__dirname, "data", userId.toString());

          // Ensure the directory exists, creating it if necessary
          if (!fs.existsSync(userDirectory)) {
            fs.mkdirSync(userDirectory, { recursive: true }); // Ensure parent directories are created if they don't exist
          }

          // Construct the file path
          const filePath = path.join(userDirectory, xlsxFileName);

          // Write the file to the specified directory
          XLSX.writeFile(wb, filePath);

          // Create a promise to wait for the file to be written
          const waitForFile = new Promise((resolve, reject) => {
            const checkFile = () => {
              if (fs.existsSync(filePath)) {
                resolve();
              } else {
                setTimeout(checkFile, 100); // Check again after a short delay
              }
            };
            checkFile();
          });

          // Wait for the file to be written before replying with the document
          waitForFile.then(() => {
            ctx.replyWithDocument(new InputFile(filePath), {
              caption: `Position Data - ${timestamp}`,
            });
          });
        } else {
          await ctx.reply(`No positions data available.`);
        }
      } else {
        throw new Error("No selected account");
      }
    } else if (queryData === "gettransfer") {
      if (ctx.session.selectedAccount) {
        const web3 = new Web3();
        web3.eth.accounts.wallet.add(ctx.session.selectedAccount.privateKey);
        const address = web3.eth.accounts.wallet[0].address;
        // Confirm that the provided information is correct
        if (!address) {
          throw new Error("Invalid private key format");
        }
        const client = new DydxClient(HTTP_HOST, { web3 });
        const apiCreds = await client.onboarding.recoverDefaultApiCredentials(
          address
        );
        client.apiKeyCredentials = apiCreds;
        const { transfers } = await client.private.getTransfers();

        if (transfers.length > 0) {
          const ws = XLSX.utils.json_to_sheet(transfers);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const xlsxFileName = `transfers_${timestamp}.xlsx`;

          // Define the directory path
          const userDirectory = path.join(__dirname, "data", userId.toString());

          // Ensure the directory exists, creating it if necessary
          if (!fs.existsSync(userDirectory)) {
            fs.mkdirSync(userDirectory, { recursive: true }); // Ensure parent directories are created if they don't exist
          }

          // Construct the file path
          const filePath = path.join(userDirectory, xlsxFileName);

          // Write the file to the specified directory
          XLSX.writeFile(wb, filePath);

          // Create a promise to wait for the file to be written
          const waitForFile = new Promise((resolve, reject) => {
            const checkFile = () => {
              if (fs.existsSync(filePath)) {
                resolve();
              } else {
                setTimeout(checkFile, 100); // Check again after a short delay
              }
            };
            checkFile();
          });

          // Wait for the file to be written before replying with the document
          waitForFile.then(() => {
            ctx.replyWithDocument(new InputFile(filePath), {
              caption: `Transfers Data - ${timestamp}`,
            });
          });
        } else {
          await ctx.reply(`No transfers data available.`);
        }
      } else {
        throw new Error("No selected account");
      }
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    await ctx.answerCallbackQuery();
    if (
      error.description ===
      "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message"
    ) {
      await ctx.reply(`You selected the same account.`);
    } else if (error.message === "No selected account") {
      await ctx.reply(
        `No selected account. Use /accounts to select your account`
      );
    } else {
      await ctx.reply(`Error handling callback query: ${error.message}`);
    }
    logger.error(`Error handling callback query: ${error.message}`);
  }
});

bot.on("message", async (ctx) => {
  const messageText = ctx.message.text;
  const userId = ctx.from.id;
  try {
    const settingUpAccount = ctx.session.settingUpAccount;

    if (settingUpAccount) {
      const { userId, step } = settingUpAccount;

      if (step === 1) {
        // Save the entered account name and prompt for the private key
        settingUpAccount.accountName = messageText;
        settingUpAccount.step = 2;
        await ctx.reply("Please enter the private key for the account:");
      } else if (step === 2) {
        // Validate the private key (You may want to add additional validation)
        if (!messageText.startsWith("0x")) {
          throw new Error(
            "Invalid private key format. It should start with '0x'."
          );
        }
        const web3 = new Web3();
        web3.eth.accounts.wallet.add(messageText);
        const address = web3.eth.accounts.wallet[0].address;
        // Confirm that the provided information is correct
        if (!address) {
          throw new Error("Invalid private key format");
        }
        // Save the private key for the user and account
        const newAccountNumber = Object.keys(accounts[userId] || {}).length + 1;
        const accountKey = `account_${newAccountNumber}`;
        const client = new DydxClient(HTTP_HOST, { web3 });
        const apiCreds = await client.onboarding.recoverDefaultApiCredentials(
          address
        );
        client.apiKeyCredentials = apiCreds;
        const { user } = await client.private.getUser();
        if (!accounts[userId]) {
          accounts[userId] = {};
        }

        accounts[userId][accountKey] = {
          name: settingUpAccount.accountName,
          privateKey: messageText,
          address,
          user,
        };
        saveAccounts();

        // Respond to the user
        await ctx.reply(
          `Private key for Account ${newAccountNumber} set successfully.`
        );
        delete ctx.session.settingUpAccount; // Clear the settingUpAccount state

        logger.info(
          `Private key set for user ${userId}, Account ${newAccountNumber}: ${messageText}`
        );
      }
    }

    if (ctx.session.awaitingMarketSymbol && ctx.message.text) {
      const marketSymbol = ctx.message.text.trim();

      // Reset the session state
      ctx.session.awaitingMarketSymbol = false;

      // Proceed with fetching historical funding data based on the provided market symbol
      const client = new DydxClient(HTTP_HOST);

      const { historicalFunding } = await client.public.getHistoricalFunding({
        market: marketSymbol,
      });

      if (historicalFunding && historicalFunding.length > 0) {
        const ws = XLSX.utils.json_to_sheet(historicalFunding);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const xlsxFileName = `historicalfunding_${timestamp}.xlsx`;

        // Define the directory path
        const userDirectory = path.join(__dirname, "data", userId.toString());

        // Ensure the directory exists, creating it if necessary
        if (!fs.existsSync(userDirectory)) {
          fs.mkdirSync(userDirectory, { recursive: true }); // Ensure parent directories are created if they don't exist
        }

        // Construct the file path
        const filePath = path.join(userDirectory, xlsxFileName);

        // Write the file to the specified directory
        XLSX.writeFile(wb, filePath);

        // Create a promise to wait for the file to be written
        const waitForFile = new Promise((resolve, reject) => {
          const checkFile = () => {
            if (fs.existsSync(filePath)) {
              resolve();
            } else {
              setTimeout(checkFile, 100); // Check again after a short delay
            }
          };
          checkFile();
        });

        // Wait for the file to be written before replying with the document
        waitForFile.then(() => {
          ctx.replyWithDocument(new InputFile(filePath), {
            caption: `Historical Funding Data - ${timestamp}`,
          });
        });
      } else {
        await ctx.reply(
          "No historical funding data available for the provided market symbol."
        );
      }
    }
  } catch (error) {
    await ctx.reply(`Error: ${error.message}`);
  }
});

bot.catch((err) => console.error(err));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

bot.start();
app.listen(4004, () => console.log("Server running on port 4004"));
