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
  let num = req.query.number?.replace(/[^0-9]/g, "");
  let interval; // Loop control

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    try {
      const RobinPairWeb = makeWASocket({
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

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          clearInterval(interval); // Stop pairing loop
          await delay(10000);

          const sessionPrabath = fs.readFileSync("./session/creds.json");
          const auth_path = "./session/";
          const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

          function randomMegaId(length = 6, numberLength = 4) {
            const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let result = "";
            for (let i = 0; i < length; i++) {
              result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
            return `${result}${number}`;
          }

          const mega_url = await upload(
            fs.createReadStream(auth_path + "creds.json"),
            `${randomMegaId()}.json`
          );

          const string_session = mega_url.replace("https://mega.nz/file/", "");

          const sid = `*ZapBot [The powerful WA BOT]*\n\n👉 ${string_session} 👈\n\n*This is your Session ID. Paste into config.js file*\n\n*Need help? wa.me/message/+94705344946*\n\n*Join group: https://chat.whatsapp.com/GAOhr0qNK7KEvJwbenGivZ*`;
          const mg = `🛑 *Do not share this code with anyone* 🛑`;

          await RobinPairWeb.sendMessage(user_jid, {
            text: sid,
          });
          await RobinPairWeb.sendMessage(user_jid, { text: string_session });
          await RobinPairWeb.sendMessage(user_jid, { text: mg });

          await delay(100);
          removeFile("./session");
          process.exit(0);
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          await delay(10000);
          RobinPair();
        }
      });

      if (!state.creds.registered) {
        const sendPairingCode = async () => {
          try {
            const code = await RobinPairWeb.requestPairingCode(num);
            console.log(`Pairing code generated: ${code}`);
            if (!res.headersSent) {
              res.write(JSON.stringify({ code }) + "\n");
            }
          } catch (err) {
            console.error("Pairing code error:", err.message);
          }
        };

        await sendPairingCode(); // first
        interval = setInterval(sendPairingCode, 50000); // every 50 seconds
      }
    } catch (err) {
      console.error("Error in RobinPair:", err);
      exec("pm2 restart Robin-md");
      removeFile("./session");
      if (!res.headersSent) {
        res.status(503).send({ code: "Service Unavailable" });
      }
    }
  }

  await RobinPair();
});

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
  exec("pm2 restart Robin");
});

module.exports = router;
