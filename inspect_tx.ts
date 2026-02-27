import { ElectrumNetworkProvider } from "cashscript";
import { decodeTransaction, hexToBin, binToHex } from "@bitauth/libauth";

async function run() {
    const provider = new ElectrumNetworkProvider('chipnet');
    const txid = "25fab7abf3714b572bc1030b738d3f0c22498496c913b786975d778229d6e4c6";
    const raw = await provider.getRawTransaction(txid);
    const tx = decodeTransaction(hexToBin(raw));
    if (typeof tx === 'string') throw new Error(tx);
    
    tx.outputs.forEach((out, i) => {
        console.log(`Output ${i}:`);
        console.log(`  Value: ${out.valueSatoshis}`);
        if (out.token) {
            console.log(`  Token Category: ${binToHex(out.token.category)}`);
            console.log(`  Token Amount: ${out.token.amount}`);
        } else {
            console.log(`  No Token`);
        }
    });
}
run().catch(console.error);
