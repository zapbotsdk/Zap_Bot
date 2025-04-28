const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
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

let router = express.Router();

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;

  if (!num) {
    return res.status(400).send({ error: "Phone number is required!" });
  }

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

      let pairingCode = null;
      let pairingTimer = null;

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        pairingCode = await RobinPairWeb.requestPairingCode(num);

        if (!pairingCode) {
          if (!res.headersSent) {
            return res.status(503).send({ error: "Failed to generate pairing code." });
          }
          return;
        }

        const jid = jidNormalizedUser(num);

        async function sendPairingCode() {
          try {
            await RobinPairWeb.sendMessage(jid, {
              text: `🛡️ *Your Device Pairing Code:* *${pairingCode}*\n\n🛑 Open WhatsApp ➔ Linked Devices ➔ Link a Device ➔ Enter Code.`,
            });
          } catch (e) {
            console.error("Error sending pairing code:", e.message);
          }
        }

        await sendPairingCode(); // First send

        // 🔁 Set interval to resend pairing code every 2 minutes
        pairingTimer = setInterval(async () => {
          await sendPairingCode();
        }, 2 * 60 * 1000);

        if (!res.headersSent) {
          await res.send({ code: pairingCode });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          if (pairingTimer) clearInterval(pairingTimer);

          try {
            await delay(10000);
            const auth_path = "./session/";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

            function randomMegaId(length = 6, numberLength = 4) {
              const characters =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
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

            const string_session = mega_url.replace(
              "https://mega.nz/file/",
              ""
            );

            const sid = `*ZapBot [The powerful WA BOT]*\n\n👉 ${string_session} 👈\n\n*This is your Session ID. Copy and paste into config.js file.*\n\n*Support: wa.me/94705344946*\n\n*Group: https://chat.whatsapp.com/GAOhr0qNK7KEvJwbenGivZ*`;
            const warning = `🛑 *Do not share this Session ID with anyone!* 🛑`;

            await RobinPairWeb.sendMessage(user_jid, { text: sid });
            await RobinPairWeb.sendMessage(user_jid, { text: warning });

          } catch (error) {
            console.error("Error sending session info:", error);
            exec("pm2 restart prabath");
          }

          await delay(100);
          removeFile("./session");
          process.exit(0);

        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          console.log("Connection closed, reconnecting...");
          if (pairingTimer) clearInterval(pairingTimer);
          await delay(10000);
          RobinPair();
        }
      });

    } catch (error) {
      console.error("Error in RobinPair:", error);
      exec("pm2 restart Robin-md");
      await removeFile("./session");
      if (!res.headersSent) {
        await res.status(503).send({ error: "Service Unavailable. Try again later." });
      }
    }
  }

  await RobinPair();
});

process.on("uncaughtException", function (err) {
  console.error("Caught exception: " + err);
  exec("pm2 restart Robin");
});

module.exports = router;
