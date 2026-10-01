require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function safe(value) {
  if (typeof value === "bigint") return value.toString();

  if (Array.isArray(value)) {
    return value.map(safe);
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, val] of Object.entries(value)) {
      const lower = key.toLowerCase();

      if (
        lower.includes("cipher") ||
        lower.includes("secret") ||
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("apikey") ||
        lower.includes("api_key") ||
        lower.includes("accountnumber")
      ) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = safe(val);
      }
    }

    return result;
  }

  return value;
}

async function main() {
  const propertyId = "cmuins0v60009w8o4f0uyjjxt";

  const property = await prisma.property.findUnique({
    where: { id: propertyId }
  });

  console.log("\n=== PROPERTY ===");
  console.log(JSON.stringify(safe(property), null, 2));

  if (!property) {
    console.log("Property not found.");
    return;
  }

  const owner = await prisma.user.findUnique({
    where: { id: property.ownerId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });

  console.log("\n=== SELLER / OWNER ===");
  console.log(JSON.stringify(safe(owner), null, 2));

  const payoutAccount = await prisma.payoutAccount.findUnique({
    where: { userId: property.ownerId }
  });

  console.log("\n=== SELLER PAYOUT ACCOUNT ===");
  console.log(JSON.stringify(safe(payoutAccount), null, 2));

  const transactions = await prisma.financialTransaction.findMany({
    where: { propertyId },
    orderBy: { createdAt: "desc" }
  });

  console.log("\n=== FINANCIAL TRANSACTIONS ===");
  console.log(JSON.stringify(safe(transactions), null, 2));

  const payouts = await prisma.payout.findMany({
    where: {
      transaction: {
        propertyId
      }
    },
    orderBy: { createdAt: "desc" }
  });

  console.log("\n=== PAYOUTS ===");
  console.log(JSON.stringify(safe(payouts), null, 2));

  console.log("\n=== RUNTIME FLAGS ===");
  console.log(JSON.stringify({
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || "not set",
    PAYOUTS_ENABLED: process.env.PAYOUTS_ENABLED || "not set",
    MOCK_PAYMENTS_ENABLED: process.env.MOCK_PAYMENTS_ENABLED || "not set",
    APP_URL: process.env.APP_URL || "not set"
  }, null, 2));

  console.log("\n=== TEST KEY STATUS ===");

  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";

  console.log({
    PAYSTACK_SECRET_KEY:
      secret.startsWith("sk_test_") ? "TEST MODE" :
      secret.startsWith("sk_live_") ? "LIVE MODE - STOP" :
      secret ? "UNRECOGNIZED" : "NOT SET",

    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY:
      publicKey.startsWith("pk_test_") ? "TEST MODE" :
      publicKey.startsWith("pk_live_") ? "LIVE MODE - STOP" :
      publicKey ? "UNRECOGNIZED" : "NOT SET"
  });
}

main()
  .catch(error => {
    console.error("\nDIAGNOSTIC ERROR:");
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


