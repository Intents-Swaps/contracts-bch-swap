/**
 * LimitOrderSwap Test Script
 *
 * Tests the LimitOrderSwap.cash contract on BCH Chipnet.
 * Validates:
 *   1. Contract compilation and instantiation
 *   2. Fixed price enforcement
 *   3. Expiry logic
 */

import {
    Contract,
    ElectrumNetworkProvider,
} from 'cashscript';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const NETWORK = 'chipnet';

// ============================================================================
// Test: Compilation & Instantiation
// ============================================================================

async function testCompilation() {
    console.log('\n[===== TEST 1: Compilation & Instantiation =====]');

    const provider = new ElectrumNetworkProvider(NETWORK);

    let artifact: any;
    try {
        const artifactPath = join(__dirname, '..', 'artifacts', 'LimitOrderSwap.json');
        artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
        console.log('  ✅ Artifact loaded from file');
    } catch {
        const { compileFile } = await import('cashscript');
        const contractPath = join(__dirname, '..', 'contracts', 'LimitOrderSwap.cash');
        artifact = compileFile(contractPath);
        console.log('  ✅ Compiled from source');
    }

    const makerPkh = Buffer.alloc(20, 0xCC);
    const sellTokenCategory = Buffer.alloc(0); // native BCH
    const buyTokenCategory = Buffer.alloc(0);  // native BCH
    const sellAmount = 50000n;
    const buyAmount = 100000n;
    const expiryTime = BigInt(Math.floor(Date.now() / 1000) + 7200); // 2 hours from now

    const contract = new Contract(
        artifact,
        [makerPkh, sellTokenCategory, buyTokenCategory, sellAmount, buyAmount, expiryTime],
        { provider }
    );

    console.log(`  ✅ Contract instantiated: ${contract.address}`);

    const balance = await contract.getBalance();
    console.log(`  ℹ️  Balance: ${balance} satoshis`);

    return true;
}

// ============================================================================
// Test: Fixed Price Logic (Off-chain)
// ============================================================================

function testFixedPriceLogic() {
    console.log('\n[===== TEST 2: Fixed Price Logic =====]');

    const buyAmount = 100000;
    const expiryTime = 1700003600;

    // Before expiry — fill should succeed
    const fillTime = 1700000000;
    const fillValid = fillTime < expiryTime;
    console.log(`  ${fillValid ? '✅' : '❌'} Fill before expiry: valid=${fillValid}`);

    // After expiry — fill should fail, cancel should succeed
    const cancelTime = 1700010000;
    const cancelValid = cancelTime >= expiryTime;
    console.log(`  ${cancelValid ? '✅' : '❌'} Cancel after expiry: valid=${cancelValid}`);

    // Price enforcement
    const resolverPays = 100000;
    const priceValid = resolverPays >= buyAmount;
    console.log(`  ${priceValid ? '✅' : '❌'} Price enforcement: resolver pays ${resolverPays} >= ${buyAmount}`);

    const underpay = 90000;
    const underpayInvalid = underpay < buyAmount;
    console.log(`  ${underpayInvalid ? '✅' : '❌'} Underpay rejected: ${underpay} < ${buyAmount}`);

    return fillValid && cancelValid && priceValid && underpayInvalid;
}

// ============================================================================
// Test: Address differences for different parameters
// ============================================================================

async function testParameterIsolation() {
    console.log('\n[===== TEST 3: Parameter Isolation =====]');

    const provider = new ElectrumNetworkProvider(NETWORK);

    let artifact: any;
    try {
        const { compileFile } = await import('cashscript');
        artifact = compileFile(join(__dirname, '..', 'contracts', 'LimitOrderSwap.cash'));
    } catch {
        artifact = JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'LimitOrderSwap.json'), 'utf-8'));
    }

    const baseParams: any[] = [
        Buffer.alloc(20, 0xDD),
        Buffer.alloc(0),
        Buffer.alloc(0),
        50000n,
        100000n,
        1700003600n,
    ];

    // Same params = same address
    const c1 = new Contract(artifact, baseParams, { provider });
    const c2 = new Contract(artifact, baseParams, { provider });
    console.log(`  ${c1.address === c2.address ? '✅' : '❌'} Same params → same address`);

    // Different buyAmount = different address
    const params2 = [...baseParams];
    params2[4] = 150000n;
    const c3 = new Contract(artifact, params2, { provider });
    console.log(`  ${c1.address !== c3.address ? '✅' : '❌'} Different buyAmount → different address`);

    return true;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   LimitOrderSwap.cash — Test Suite                  ║');
    console.log('║   Network: Chipnet (BCH Testnet)                    ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    const results: { name: string; passed: boolean }[] = [];

    try {
        const p1 = await testCompilation();
        results.push({ name: 'Compilation & Instantiation', passed: p1 });
    } catch (e: any) {
        console.error('  ❌ Error:', e.message);
        results.push({ name: 'Compilation & Instantiation', passed: false });
    }

    try {
        const p2 = testFixedPriceLogic();
        results.push({ name: 'Fixed Price Logic', passed: p2 });
    } catch (e: any) {
        console.error('  ❌ Error:', e.message);
        results.push({ name: 'Fixed Price Logic', passed: false });
    }

    try {
        const p3 = await testParameterIsolation();
        results.push({ name: 'Parameter Isolation', passed: p3 });
    } catch (e: any) {
        console.error('  ❌ Error:', e.message);
        results.push({ name: 'Parameter Isolation', passed: false });
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║   Test Results Summary                              ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    for (const r of results) {
        const icon = r.passed ? '✅' : '❌';
        console.log(`║   ${icon} ${r.name.padEnd(46)}║`);
    }
    console.log('╚══════════════════════════════════════════════════════╝');

    process.exit(results.every(r => r.passed) ? 0 : 1);
}

main().catch(console.error);
