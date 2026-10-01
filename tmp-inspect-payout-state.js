require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const property = await p.property.findUnique({
    where: { id: 'cmuins0v60009w8o4f0uyjjxt' },
    select: { id: true, title: true, price: true, currencyCode: true, status: true, ownerId: true, agentId: true },
  });
  console.log('Property:', JSON.stringify({ ...property, price: property?.price?.toString() }, null, 2));

  if (property) {
    const owner = await p.user.findUnique({
      where: { id: property.ownerId },
      select: { id: true, name: true, email: true, role: true },
    });
    console.log('Owner/Seller:', JSON.stringify(owner, null, 2));

    const payoutAccount = await p.payoutAccount.findUnique({ where: { userId: property.ownerId } });
    console.log(
      'Seller PayoutAccount:',
      payoutAccount ? JSON.stringify({ ...payoutAccount, accountNumberCipher: '[REDACTED]' }, null, 2) : 'NONE',
    );

    const transactions = await p.financialTransaction.findMany({
      where: { propertyId: property.id },
      select: {
        id: true,
        status: true,
        reference: true,
        buyerId: true,
        sellerId: true,
        payoutStatus: true,
        payoutDueAt: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log('Transactions:', JSON.stringify(transactions, null, 2));

    const payouts = await p.payout.findMany({
      where: { transaction: { propertyId: property.id } },
      select: { id: true, status: true, amount: true, currencyCode: true, approvedAt: true, transferCode: true, attempts: true },
    });
    console.log('Payouts:', JSON.stringify(payouts.map((x) => ({ ...x, amount: x.amount.toString() })), null, 2));
  }
})()
  .catch((e) => {
    console.error('DB check failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
