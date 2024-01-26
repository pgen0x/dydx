const { DydxMarket } = require("@dydxprotocol/starkex-lib");
const { DydxClient } = require("@dydxprotocol/v3-client");
const { Bot, Context, session, InlineKeyboard } = require("grammy");
const Web3 = require("web3");
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const log4js = require("./config/log4js");
const logger = log4js.getLogger("app");
const moment = require("moment-timezone");

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
    await ctx.reply(`Error setting private key: ${error.message}`);
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
        const isSelected = ctx.session.selectedAccount
          ? ctx.session.selectedAccount.accountKey === accountKey
          : false;

        const accountText = isSelected
          ? `✅ Account ${account.name}`
          : `Account ${account.name}`;

        accountsMenu.text(accountText, `getaccount_${accountKey}`);
      }

      accountsMenu.row().text("Add New Account", "addnewaccount");

      await ctx.reply("Your saved accounts:", {
        reply_markup: accountsMenu,
      });
    }
  } catch (error) {
    await ctx.reply(`Error checking accounts: ${error.message}`);
  }
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
    } else {
      // Handle other callback queries if needed
    }

    // Answer the callback query to close the inline keyboard
    await ctx.answerCallbackQuery();
  } catch (error) {
    if (
      (error.description =
        "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message")
    ) {
      await ctx.reply(`You selected the same account.`);
    }
    logger.error(`Error handling callback query: ${error.message}`);
  }
});

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

    const accountText = isSelected
      ? `✅ Account ${account.name}`
      : `Account ${account.name}`;

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
  const uniqueMessageText = `Your saved accounts:\nSelected Account: ${ctx.session.selectedAccount.privateKey}`;

  // Edit the message with the updated accounts keyboard
  await ctx.editMessageText(uniqueMessageText, {
    reply_markup: accountsMenu,
  });
}

bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const messageText = ctx.message.text;

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

        // Save the private key for the user and account
        const newAccountNumber = Object.keys(accounts[userId] || {}).length + 1;
        const accountKey = `account_${newAccountNumber}`;

        if (!accounts[userId]) {
          accounts[userId] = {};
        }

        accounts[userId][accountKey] = {
          name: settingUpAccount.accountName,
          privateKey: messageText,
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
  } catch (error) {
    await ctx.reply(`Error setting private key: ${error.message}`);
  }
});

bot.catch((err) => console.error(err));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

bot.start();
app.listen(4004, () => console.log("Server running on port 4004"));
