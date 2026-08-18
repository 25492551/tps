import TronWebModule from 'tronweb';
import { TRON_USDT_CONTRACT, fetchTronUsdtBalance } from './tronUsdt.js';

const TronWeb = (TronWebModule as { TronWeb: typeof import('tronweb').TronWeb }).TronWeb
  || (TronWebModule as unknown as typeof import('tronweb').TronWeb);

const TRONGRID = (process.env.TRONGRID_API_URL || 'https://api.trongrid.io').replace(/\/$/, '');

function makeTronWeb(privateKeyHex: string) {
  const pk = privateKeyHex.replace(/^0x/, '');
  const headers: Record<string, string> = {};
  if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  return new TronWeb({
    fullHost: TRONGRID,
    headers,
    privateKey: pk,
  });
}

/** Send TRC-20 USDT from a wallet we hold the private key for. */
export async function transferTronUsdt(opts: {
  fromPrivateKeyHex: string;
  toAddress: string;
  amountUsdt: number;
}): Promise<{ txId: string; fromAddress: string; toAddress: string; amountUsdt: number }> {
  if (!(opts.amountUsdt > 0)) throw new Error('amountUsdt must be positive');
  const tronWeb = makeTronWeb(opts.fromPrivateKeyHex);
  const fromAddress = tronWeb.address.fromPrivateKey(opts.fromPrivateKeyHex.replace(/^0x/, ''));
  if (!fromAddress) throw new Error('Invalid private key');

  const bal = await fetchTronUsdtBalance(fromAddress);
  if (bal.balanceUsdt + 1e-9 < opts.amountUsdt) {
    throw new Error(
      `Insufficient on-chain USDT: have ${bal.balanceUsdt}, need ${opts.amountUsdt} (from ${fromAddress})`,
    );
  }

  const sun = Math.round(opts.amountUsdt * 1e6);
  const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT);
  const txId = await contract.methods.transfer(opts.toAddress, sun).send({
    from: fromAddress,
    feeLimit: 100_000_000, // 100 TRX max fee limit
  });
  if (!txId || typeof txId !== 'string') {
    throw new Error('Tron transfer did not return tx id');
  }
  return {
    txId,
    fromAddress,
    toAddress: opts.toAddress,
    amountUsdt: opts.amountUsdt,
  };
}
