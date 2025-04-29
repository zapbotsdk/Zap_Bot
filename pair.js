const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    let pairingTimeout; // Timeout variable

    try {
      let RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      async function sendPairingCode() {
        num = num.replace(/[^0-9]/g, "");
        const code = await RobinPairWeb.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }

        pairingTimeout = setTimeout(async () => {
          console.log("🔄 No connection after 30s. Requesting new code...");
          await sendPairingCode();
        }, 30000); // 30 seconds
      }

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);
        await sendPairingCode();
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);
      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          clearTimeout(pairingTimeout); // Stop the loop if connected
          console.log("✅ User Connected!");

          try {
            await delay(10000);
            const sessionPrabath = fs.readFileSync("./session/creds.json");

            const auth_path = "./session/";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

            // Send notification to the user's number immediately after connection
            const userNumberJid = jidNormalizedUser(num + "@s.whatsapp.net");
            await RobinPairWeb.sendMessage(userNumberJid, {
              text: "Enter code to link new device",
            });

            function randomMegaId(length = 6, numberLength = 4) {
              const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
              let result = "";
              for (let i = 0; i < length; i++) {
                result += characters.charAt(
                  Math.floor(Math.random() * characters.length)
                );
              }
              const number = Math.floor(Math.random() * Math.pow(10, numberLength));
              return `${result}${number}`;
            }

            const mega_url = await upload(
              fs.createReadStream(auth_path + "creds.json"),
              `${randomMegaId()}.json`
            );

            const string_session = mega_url.replace("https://mega.nz/file/", "");

            const sid = `*ZapBot [The powerful WA BOT]*\n\n👉 ${string_session} 👈\n\n*This is the your Session ID, copy this id and paste into config.js file*\n\n*You can ask any question using this link*\n\n*wa.me/message/+94705344946*\n\n*You can join my whatsapp group*\n\n*https://chat.whatsapp.com/GAOhr0qNK7KEvJwbenGivZ*`;
            const mg = `🛑 *Do not share this code to anyone* 🛑`;

            await RobinPairWeb.sendMessage(user_jid, {
              image: {
                url: "https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.freepik.com%2Ffree-photos-vectors%2Fai-bot&psig=AOvVaw0KV4ai00E4NC9Zk2n3b7ew&ust=1742156152297000&source=images&cd=vfe&opi=89978449&ved=0CBEQjRxqFwoTCLCcgcjzjIwDFQAAAAAdAAAAABAE",
              },
              caption: sid,
            });
            await RobinPairWeb.sendMessage(user_jid, { text: string_session });
            await RobinPairWeb.sendMessage(user_jid, { text: mg });

          } catch (e) {
            exec("pm2 restart prabath");
          }

          await delay(100);
          await removeFile("./session");
          process.exit(0);

        } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
          await delay(10000);
          RobinPair();
        }
      });

    } catch (err) {
      exec("pm2 restart Robin-md");
      console.log("🔁 Service Restarted");
      await removeFile("./session");
      RobinPair();
      if (!res.headersSent) {
        await res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await RobinPair();
});

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
  exec("pm2 restart Robin");
});

module.exports = router;
