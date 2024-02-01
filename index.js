const { DydxClient } = require("@dydxprotocol/v3-client");
const { Bot, session, InlineKeyboard, InputFile } = require("grammy");
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

async function executeGetPositions(ctx, params) {
  const userId = ctx.from.id;
  const client = new DydxClient(HTTP_HOST);
  const apiCreds = ctx.session.selectedAccount.apiKey;
  client.apiKeyCredentials = apiCreds;

  const { positions } = params
    ? await client.private.getPositions(params)
    : await client.private.getPositions();
  logger.info(`ID: ${userId} request get positions `, positions);
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
}

async function executeGetTransfers(ctx, params) {
  const userId = ctx.from.id;
  const client = new DydxClient(HTTP_HOST);
  const apiCreds = ctx.session.selectedAccount.apiKey;
  client.apiKeyCredentials = apiCreds;

  const { transfers } = params
    ? await client.private.getTransfers(params)
    : await client.private.getTransfers();
  logger.info(`ID: ${userId} request get transfers `, transfers);
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
}

async function executeGetOrders(ctx, params) {
  const userId = ctx.from.id;
  const client = new DydxClient(HTTP_HOST);
  const apiCreds = ctx.session.selectedAccount.apiKey;
  client.apiKeyCredentials = apiCreds;
  const { orders } = params
    ? await client.private.getOrders(params)
    : await client.private.getOrders();
  logger.info(`ID: ${userId} request get orders `, orders);
  if (orders.length > 0) {
    const ws = XLSX.utils.json_to_sheet(orders);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const xlsxFileName = `orders_${timestamp}.xlsx`;
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
        caption: `Orders Data - ${timestamp}`,
      });
    });
  } else {
    await ctx.reply(`No orders data available.`);
  }
}

async function executeGetFundingPayment(ctx, params) {
  const userId = ctx.from.id;
  const client = new DydxClient(HTTP_HOST);
  const apiCreds = ctx.session.selectedAccount.apiKey;
  client.apiKeyCredentials = apiCreds;
  const { fundingPayments } = params
    ? await client.private.getFundingPayments(params)
    : await client.private.getFundingPayments();

  logger.info(`ID: ${userId} request get fundingPayments `, fundingPayments);
  if (fundingPayments.length > 0) {
    const ws = XLSX.utils.json_to_sheet(fundingPayments);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet 1");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const xlsxFileName = `fundingPayments_${timestamp}.xlsx`;

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
        caption: `Funding Payments Data - ${timestamp}`,
      });
    });
  } else {
    await ctx.reply(`No funding payments data available.`);
  }
}

async function executeGetHistoricalFunding(ctx, params) {
  try {
    const userId = ctx.from.id;
    const client = new DydxClient(HTTP_HOST);
    const { historicalFunding } = await client.public.getHistoricalFunding(
      params
    );
    logger.info(
      `ID: ${userId} request get HistoricalFunding `,
      historicalFunding
    );

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
      await ctx.reply(`No historical funding data available.`);
    }
  } catch (error) {
    logger.error(`Error on executeGetHistoricalFunding:`, error);
    throw new Error("Something went wrong");
  }
}

bot.command("ping", async (ctx) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: "OK",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: moment().format("DD-MM-YYYY HH:mm:ss"),
  };
  try {
    await ctx.reply(
      `<b>pong!</b>\n\nuptime: ${healthcheck.uptime}\nmessage: ${healthcheck.message}\nserver timezone: ${healthcheck.timezone}\nserver timestamp:  ${healthcheck.timestamp}`,
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
  const helpMessage = `Welcome to the DYDX Snap Bot!\n\nTo begin using the bot, you need to set up an account. This will allow you to access private information from dYdX.\n\n<b>Available Commands:</b>\n/ping - Check the bot's health and uptime.\n/setaccount - Set up a new account.\n/accounts - View and manage your saved accounts.\n/dydxprivatemenus - View private information from dYdX.\n/dydxpublicmenus - View public information from dYdX.\n/help - Display this help message.\n\nPlease note that access to private menus requires setting up an account first. Public menus can be accessed without setting up an account.`;

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

      if (account && account.name && account.apiKey) {
        // Mark the account as selected
        ctx.session.selectedAccount = {
          accountKey,
          name: account.name,
          apiKey: account.apiKey,
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
      delete ctx.session.getHistoricalFunding;
      await ctx.reply(
        "Enter the market symbol (e.g., BTC-USD)\n\nThis field is required and cannot be skipped:"
      );

      ctx.session.getHistoricalFunding = { step: 1 };
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
        delete ctx.session.getPositions;
        await ctx.reply(
          "Enter the market symbol (e.g., BTC-USD)\n\nThis field is optional. Send /skip to skip",
          {
            parse_mode: "HTML",
          }
        );
        ctx.session.getPositions = { step: 1 };
      } else {
        throw new Error("No selected account");
      }
    } else if (queryData === "gettransfer") {
      delete ctx.session.gettransfer;
      if (ctx.session.selectedAccount) {
        await ctx.reply(
          "Enter the transfer type. Can be <code>DEPOSIT</code>, <code>WITHDRAWAL</code> or <code>FAST_WITHDRAWAL</code>\n\nThis field is optional. Send /skip to skip",
          {
            parse_mode: "HTML",
          }
        );
        ctx.session.getTransfers = { step: 1 };
      } else {
        throw new Error("No selected account");
      }
    } else if (queryData === "getorders") {
      delete ctx.session.getOrders;
      if (ctx.session.selectedAccount) {
        await ctx.reply(
          "Enter the market symbol (e.g., BTC-USD)\n\nThis field is optional. Send /skip to skip",
          {
            parse_mode: "HTML",
          }
        );
        ctx.session.getOrders = { step: 1 };
      } else {
        throw new Error("No selected account");
      }
    } else if (queryData === "getfundingpayment") {
      delete ctx.session.getFundingPayment;
      if (ctx.session.selectedAccount) {
        await ctx.reply(
          "Enter the market symbol (e.g., BTC-USD)\n\nThis field is optional. Send /skip to skip",
          {
            parse_mode: "HTML",
          }
        );
        ctx.session.getFundingPayment = { step: 1 };
      } else {
        throw new Error("No selected account");
      }
    } else if (queryData === "getaccounts") {
      if (ctx.session.selectedAccount) {
        const client = new DydxClient(HTTP_HOST);
        const apiCreds = ctx.session.selectedAccount.apiKey;
        client.apiKeyCredentials = apiCreds;
        const { accounts } = await client.private.getAccounts();
        logger.info(
          `ID: ${userId} request get accounts `,
          JSON.stringify(accounts)
        );
        if (accounts.length > 0) {
          const flattenedAccounts = accounts.map((account) => {
            // Convert the openPositions object to an array of objects
            const openPositionsArray = Object.entries(
              account.openPositions
            ).map(([key, value]) => ({
              market: key,
              ...value,
            }));
            return { ...account, openPositions: openPositionsArray };
          });

          const wb = XLSX.utils.book_new();

          // Convert the accounts array to a sheet
          const wsAccounts = XLSX.utils.json_to_sheet(flattenedAccounts);
          XLSX.utils.book_append_sheet(wb, wsAccounts, "Accounts");

          // Create separate sheets for each market in openPositions data
          flattenedAccounts.forEach((account, index) => {
            const openPositions = account.openPositions;
            openPositions.forEach((position, positionIndex) => {
              const wsOpenPositions = XLSX.utils.json_to_sheet([position]);
              const marketName = `Open Positions - ${position.market}`;
              XLSX.utils.book_append_sheet(wb, wsOpenPositions, marketName);
            });
          });

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const xlsxFileName = `accounts_${timestamp}.xlsx`;

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
              caption: `Accounts and Open Positions Data - ${timestamp}`,
            });
          });
        } else {
          await ctx.reply(`No accounts data available.`);
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
  try {
    const settingUpAccount = ctx.session.settingUpAccount;
    const getPositions = ctx.session.getPositions;
    const getTransfers = ctx.session.getTransfers;
    const getOrders = ctx.session.getOrders;
    const getFundingPayment = ctx.session.getFundingPayment;
    const getHistoricalFunding = ctx.session.getHistoricalFunding;

    if (settingUpAccount) {
      const { userId, step } = settingUpAccount;

      if (step === 1) {
        // Save the entered account name and prompt for the private key
        settingUpAccount.accountName = messageText;
        settingUpAccount.step = 2;
        await ctx.reply(
          `Please enter the <b>API Key</b> for the account:\n\nYou can find it on the devtools on your browser in field <b><i>API_KEY_PAIRS</i></b>\n\nFormat Code:\n<pre>{
  "walletAddress": "0x9321...a79E",
  "secret": "vJEfdXTI_opuNFXc...ygW",
  "key": "52d44109-...-...-...-99193b0b5263",
  "passphrase": "xMnx...1au-fvnT",
  "walletType": "METAMASK"
}</pre>`,
          { parse_mode: "HTML" }
        );
      } else if (step === 2) {
        const newAccountNumber = Object.keys(accounts[userId] || {}).length + 1;
        const accountKey = `account_${newAccountNumber}`;
        const client = new DydxClient(HTTP_HOST);
        const apiCreds = JSON.parse(messageText);
        client.apiKeyCredentials = apiCreds;
        const { user } = await client.private.getUser();
        if (!accounts[userId]) {
          accounts[userId] = {};
        }

        accounts[userId][accountKey] = {
          name: settingUpAccount.accountName,
          apiKey: JSON.parse(messageText),
          address: user.ethereumAddress,
          user,
        };

        saveAccounts();

        // Respond to the user
        await ctx.reply(`Account ${newAccountNumber} set successfully.`);
        delete ctx.session.settingUpAccount; // Clear the settingUpAccount state

        logger.info(
          `Account ${user.ethereumAddress} set for user ${userId}, Account ${newAccountNumber}`
        );
      }
    }

    if (getHistoricalFunding) {
      let { step, data } = getHistoricalFunding;
      switch (step) {
        case 1:
          ctx.session.getHistoricalFunding = {
            ...getHistoricalFunding,
            data: { ...data, market: messageText }, // Merge with existing data
          };
          await ctx.reply(
            "Enter the date in YYYY-MM-DD HH:MM (24 hours time format) for effectiveBeforeOrAt\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 2:
          if (messageText.toLowerCase() === "/skip") {
            await executeGetHistoricalFunding(
              ctx,
              ctx.session.getHistoricalFunding.data
            );
            delete ctx.session.getHistoricalFunding;
            break;
          } else {
            // Parse the date to the required format
            const date = moment.tz(messageText, "YYYY-MM-DD HH:mm", "UTC");
            const formattedDate = date.format("YYYY-MM-DDTHH:mm:ss");

            ctx.session.getHistoricalFunding = {
              ...getHistoricalFunding,
              data: { ...data, effectiveBeforeOrAt: formattedDate },
            };
            await executeGetHistoricalFunding(
              ctx,
              ctx.session.getHistoricalFunding.data
            );
            delete ctx.session.getHistoricalFunding;
            break;
          }
        default:
          break;
      }
      if (ctx.session.getHistoricalFunding) {
        ctx.session.getHistoricalFunding.step = step;
      }
    }

    if (getPositions) {
      let { step, data } = getPositions;
      switch (step) {
        case 1:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getPositions = {
              ...getPositions,
              data: { ...data, market: messageText },
            };
          }
          await ctx.reply(
            "Enter the status. Can be <code>OPEN</code>, <code>CLOSED</code> or <code>LIQUIDATED</code>\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 2:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getPositions = {
              ...getPositions,
              data: { ...data, status: messageText },
            };
          }
          await ctx.reply(
            "Enter the limit\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 3:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getPositions = {
              ...getPositions,
              data: { ...data, limit: messageText },
            };
          }
          await ctx.reply(
            "Enter the date in YYYY-MM-DD HH:MM (24 hours time format) for createdBeforeOrAt\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 4:
          if (messageText.toLowerCase() !== "/skip") {
            const date = moment.tz(messageText, "YYYY-MM-DD HH:mm", "UTC");
            const formattedDate = date.format("YYYY-MM-DDTHH:mm:ss");
            ctx.session.getPositions = {
              ...getPositions,
              data: { ...data, createdBeforeOrAt: formattedDate },
            };
          }
          await executeGetPositions(ctx, ctx.session.getPositions.data);
          delete ctx.session.getPositions;
          break;
        default:
          break;
      }
      if (ctx.session.getPositions) {
        ctx.session.getPositions.step = step; // Update the step
      }
    }

    if (getTransfers) {
      let { step, data } = getTransfers;
      switch (step) {
        case 1:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getTransfers = {
              ...getTransfers,
              data: { ...data, transferType: messageText },
            };
          }
          await ctx.reply(
            "Enter the limit\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 2:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getTransfers = {
              ...getTransfers,
              data: { ...data, limit: messageText },
            };
          }
          await ctx.reply(
            "Enter the date in YYYY-MM-DD HH:MM (24 hours time format) for createdBeforeOrAt\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 3:
          if (messageText.toLowerCase() !== "/skip") {
            const date = moment.tz(messageText, "YYYY-MM-DD HH:mm", "UTC");
            const formattedDate = date.format("YYYY-MM-DDTHH:mm:ss");
            ctx.session.getTransfers = {
              ...getTransfers,
              data: { ...data, createdBeforeOrAt: formattedDate },
            };
          }
          await executeGetTransfers(ctx, ctx.session.getTransfers.data);
          delete ctx.session.getTransfers;
          break;
        default:
          break;
      }
      if (ctx.session.getTransfers) {
        ctx.session.getTransfers.step = step; // Update the step
      }
    }

    if (getOrders) {
      let { step, data } = getOrders;
      switch (step) {
        case 1:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getOrders = {
              ...getOrders,
              data: { ...data, market: messageText },
            };
          }
          await ctx.reply(
            "Enter the side. Either <code>BUY</code> or <code>SELL</code>\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 2:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getOrders = {
              ...getOrders,
              data: { ...data, side: messageText },
            };
          }
          await ctx.reply(
            "Enter the type. Can be <code>LIMIT</code>, <code>STOP</code>, <code>TRAILING_STOP</code> or <code>TAKE_PROFIT</code>\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 3:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getOrders = {
              ...getOrders,
              data: { ...data, type: messageText },
            };
          }
          await ctx.reply(
            "Enter the limit\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 4:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getOrders = {
              ...getOrders,
              data: { ...data, limit: messageText },
            };
          }
          await ctx.reply(
            "Enter the date in YYYY-MM-DD HH:MM (24 hours time format) for createdBeforeOrAt\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 5:
          if (messageText.toLowerCase() !== "/skip") {
            const date = moment.tz(messageText, "YYYY-MM-DD HH:mm", "UTC");
            const formattedDate = date.format("YYYY-MM-DDTHH:mm:ss");
            ctx.session.getOrders = {
              ...getOrders,
              data: { ...data, createdBeforeOrAt: formattedDate },
            };
          }
          await executeGetOrders(ctx, ctx.session.getOrders.data);
          delete ctx.session.getOrders;
          break;
        default:
          break;
      }
      if (ctx.session.getOrders) {
        ctx.session.getOrders.step = step;
      }
    }

    if (getFundingPayment) {
      let { step, data } = getFundingPayment;
      switch (step) {
        case 1:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getFundingPayment = {
              ...getFundingPayment,
              data: { ...data, market: messageText },
            };
          }
          await ctx.reply(
            "Enter the limit\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 2:
          if (messageText.toLowerCase() !== "/skip") {
            ctx.session.getFundingPayment = {
              ...getFundingPayment,
              data: { ...data, limit: messageText },
            };
          }
          await ctx.reply(
            "Enter the date in YYYY-MM-DD HH:MM (24 hours time format) for effectiveBeforeOrAt\n\nThis field is optional. Send /skip to skip",
            {
              parse_mode: "HTML",
            }
          );
          step++;
          break;
        case 3:
          if (messageText.toLowerCase() !== "/skip") {
            const date = moment.tz(messageText, "YYYY-MM-DD HH:mm", "UTC");
            const formattedDate = date.format("YYYY-MM-DDTHH:mm:ss");
            ctx.session.getFundingPayment = {
              ...getFundingPayment,
              data: { ...data, effectiveBeforeOrAt: formattedDate },
            };
          }
          await executeGetFundingPayment(
            ctx,
            ctx.session.getFundingPayment.data
          );
          delete ctx.session.getFundingPayment;
          break;
        default:
          break;
      }
      if (ctx.session.getFundingPayment) {
        ctx.session.getFundingPayment.step = step; // Update the step
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
