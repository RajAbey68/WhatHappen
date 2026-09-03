const crypto = require('crypto');

function hexToBuf(hex) {
  return Buffer.from(hex, 'hex');
}

function decrypt(ciphertextHex, ivHex, saltHex, passphrase) {
  const salt = hexToBuf(saltHex);
  const iv = hexToBuf(ivHex);
  const ciphertextWithTag = hexToBuf(ciphertextHex);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);

  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, null, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const inputList = [
  { p: {"ciphertext":"0b4d4b555fa5afdba50f091bad1bfd1100aa46e491e40884a2ab91e9b2e62ddedb0c065680336c07","iv":"6979842a02a637967d2ea864","salt":"ccc601631f06566570bcc73619835b68"}, t: "41s" },
  { p: {"ciphertext":"24e6577dc5c0e31625ee8596071dd2a53838a471e6d560e8e6cf8203f0441bd14f12fe6d452fd8","iv":"578b25b4e74d171af791aa96","salt":"ccc601631f06566570bcc73619835b68"}, t: "33m 19s" },
  { p: {"ciphertext":"06ce2015956f1c5ef09c98cdcd6a5fad78b7721beec4e874aa068590d4706bfd4384c878d1","iv":"b758ad273fbdddd952cc0e36","salt":"193acac910b9435270b29e1d68f639e7"}, t: "10m 43s" },
  { p: {"ciphertext":"0f6b6b87944772761de8d5a941d1fc9c6c4523ba623636f547b93da78f381aebd5","iv":"6e1e52c3ff9696a27befc248","salt":"193acac910b9435270b29e1d68f639e7"}, t: "19m 27s" },
  { p: {"ciphertext":"add09a103db14fa509b90a9044854a9ede624896b72a3bde9f833b2c6f0a851059","iv":"c79d0cafb1dd3ec2320e4ab7","salt":"193acac910b9435270b29e1d68f639e7"}, t: "212m 28s" },
  { p: {"ciphertext":"2c6784564045d12b477f6bfef590ee503be88e432d9558d764d47e9ebe89c6c069","iv":"98d80bbc812f728a4babe13d","salt":"193acac910b9435270b29e1d68f639e7"}, t: "12s" },
  { p: {"ciphertext":"a42f49346ce3b3b3d91cfa62e4d2e000f0f35389f09a497b97e5a523b1b8595521e98c9e94","iv":"6c13ed12edcca5fcad7206ff","salt":"193acac910b9435270b29e1d68f639e7"}, t: "8s" },
  { p: {"ciphertext":"dc4a52febb929435d847c020d1d6949795527891f617f89f35e4736d64d7ee37bf7e014c45","iv":"ebfd8314df04c00aa80e4af1","salt":"193acac910b9435270b29e1d68f639e7"}, t: "37m 28s" },
  { p: {"ciphertext":"2d86087a46a7821cb4668636d8b05d5a26c4f19bfe25a2e4ab49c275411cb9bb91","iv":"9c043e60fca91ebe9de18dc2","salt":"193acac910b9435270b29e1d68f639e7"}, t: "22m 15s" },
  { p: {"ciphertext":"dede34d8e64bd7d14a6ceb34d08d472f08578d8efa5f2eb41c0218fc7c7e69d90734f3010c","iv":"f07491f2727fc7b833ab3ccd","salt":"193acac910b9435270b29e1d68f639e7"}, t: "5m 51s" },
  { p: {"ciphertext":"06bb272b7c36e3cd12be020eb1a5803ed1e1ab9abd9ccaaa3943486d57400954a4","iv":"db299a617f2d62bfb2709716","salt":"193acac910b9435270b29e1d68f639e7"}, t: "43s" },
  { p: {"ciphertext":"1376fa70248af4670f502f213b210bb2d7b55fe4f205bc2f10411952c452a2cae45bcd8de0","iv":"9525381a73d1fd17af83305d","salt":"193acac910b9435270b29e1d68f639e7"}, t: "1m 31s" },
  { p: {"ciphertext":"6e2e1728f5c6f71c8b411fa454238261239606603caa07b0bca7b6b45adfaea5b83daca560","iv":"bbfddf2f79d83126904a521c","salt":"193acac910b9435270b29e1d68f639e7"}, t: "35m 46s" },
  { p: {"ciphertext":"cb41e2c52ffa64e87268628ec7ac743aa2efe568e5eb7657d6f0b57b49fc6772c7","iv":"3e3b05ceb84cdaa93def55ed","salt":"193acac910b9435270b29e1d68f639e7"}, t: "1m 46s" },
  { p: {"ciphertext":"c307cf34b4bb26637de31501a625538a1cc4291afcc43b82008f2ae8eedf534ec33f08eb05","iv":"0aa6125ed8e99b9db9a19c56","salt":"193acac910b9435270b29e1d68f639e7"}, t: "26m 9s" },
  { p: {"ciphertext":"c04d24e30cd29b667284bfc2f024fb467348a74b49d6acc756280acc87ba597d6c","iv":"8d9b27ce3982a1521f8f40d7","salt":"193acac910b9435270b29e1d68f639e7"}, t: "44m 32s" },
  { p: {"ciphertext":"ff919a77f19e01e62d2ae836734bfa8bb0f972e40e96c3e875b8892b9a561ab268","iv":"facaca4c5b7be311607a0bc5","salt":"193acac910b9435270b29e1d68f639e7"}, t: "5m 51s" },
  { p: {"ciphertext":"81a31602978ee5925e13c9f11dead1894deef99359795756f84219bffcf74f88da","iv":"43d816db4836280ed4c200bd","salt":"193acac910b9435270b29e1d68f639e7"}, t: "2m 16s" },
  { p: {"ciphertext":"e3c481adef775cd8f488054da027fa27221c8b9db79a4e89c2b7521c00f36dda3b","iv":"50a7bae227398ddf3d00cd0f","salt":"193acac910b9435270b29e1d68f639e7"}, t: "7m 12s" },
  { p: {"ciphertext":"68349d66df2392105846d3a7c4e64285e4076a0ac1c6d265d9d9c595e4adcfa08c30e7d16a","iv":"e236e3c5fed468cad3b92f01","salt":"193acac910b9435270b29e1d68f639e7"}, t: "19m 33s" },
  { p: {"ciphertext":"78c2e99e9f346365fe7452edadcafb17fd5b281ef95334c4f155b6bb191fae87ae","iv":"cb066948440225f18c6a385d","salt":"193acac910b9435270b29e1d68f639e7"}, t: "225m 51s" },
  { p: {"ciphertext":"300bb536cf127535f3c1c56a9fa263ed563be585be48e61d1ac7194baf2f61c114","iv":"b998b19c083e0607fcec4cb3","salt":"193acac910b9435270b29e1d68f639e7"}, t: "19s" },
  { p: {"ciphertext":"713f1e7b008dc92f019568f63d977a91a3c4f4f2007ba579cb3377ca401cade109","iv":"834add3de3961274e301d4ec","salt":"193acac910b9435270b29e1d68f639e7"}, t: "112m 16s" },
  { p: {"ciphertext":"e2513e69ecb19bab8d8d33c4d3983ab179f7267bf75f031ab0523b4ac0839f281fe2872f43","iv":"a5d5f9e36766f13c71f7e5f8","salt":"193acac910b9435270b29e1d68f639e7"}, t: "174m 7s" },
  { p: {"ciphertext":"e798f212fe2654a9d9c012c0ba13c06c182e918ad96ddb4dfc2a8b9b2e39b27765","iv":"4ae8b91c944b00de87e1ff69","salt":"193acac910b9435270b29e1d68f639e7"}, t: "43m 59s" },
  { p: {"ciphertext":"e9b9556ec5954f56fdfbf31f90b7e7b175a4ac9611f20dc70e7423ee13c411237b","iv":"6f746751aaf6c85aa9c8a589","salt":"193acac910b9435270b29e1d68f639e7"}, t: "15s" },
  { p: {"ciphertext":"c58cd1e82e629fb35a91bdf1f65056c2eb554d657ec1711f5d2f523480d4534f33","iv":"05bcbf93265294c28bb80680","salt":"193acac910b9435270b29e1d68f639e7"}, t: "2m 41s" },
  { p: {"ciphertext":"06f57bdc8e2edb3ef9f486e53f4908e2adb082acc29d514150ce319958abb006ad","iv":"744241b5a8bfcc1b9d85da75","salt":"193acac910b9435270b29e1d68f639e7"}, t: "11m 20s" },
  { p: {"ciphertext":"4c8329b645a76f2f2d4013a108bb5c74e8495ce12f49409ae27adcfce2b6435011a5e8f0da","iv":"184fcc8a94267df233590399","salt":"193acac910b9435270b29e1d68f639e7"}, t: "16m 36s" },
  { p: {"ciphertext":"7078888c6fd905eb965dd760f4bf5e00ce9170b8b06b80b6bc2bc3910a76a79ee0","iv":"907d87b814ba390c5f524905","salt":"193acac910b9435270b29e1d68f639e7"}, t: "14m 57s" },
  { p: {"ciphertext":"189729c6ac1df6061aad2e07eb65da52ae9872f893996d447a24c9af46bcba8ecf","iv":"9f90b0f0d6053f6f2576efe7","salt":"193acac910b9435270b29e1d68f639e7"}, t: "38s" },
  { p: {"ciphertext":"c702bb1d1568de5b57c9436f8108e6464c7e5100cd7687a77f6ad34dbb2939c1c0727b306b","iv":"18beffa9576391ca3ff486fd","salt":"193acac910b9435270b29e1d68f639e7"}, t: "45m 8s" },
  { p: {"ciphertext":"6ea788ac5e80a5c2d3ab17e8910a3bac5ba85857a469e4933c3caa43d245a5444d","iv":"3dd7b7f9537c45836917c241","salt":"193acac910b9435270b29e1d68f639e7"}, t: "N/A" }
];

function parseSeconds(tStr) {
  if (!tStr || tStr === 'N/A') return 0;
  let totalSec = 0;
  const mMatch = tStr.match(/(\d+)m/);
  const sMatch = tStr.match(/(\d+)s/);
  if (mMatch) totalSec += parseInt(mMatch[1], 10) * 60;
  if (sMatch) totalSec += parseInt(sMatch[1], 10);
  return totalSec;
}

const stats = {};

for (const item of inputList) {
  let name = 'Unknown';
  try {
    name = decrypt(item.p.ciphertext, item.p.iv, item.p.salt, 'SHANNON');
  } catch(e) {
    name = 'Decryption Failed';
  }
  const sec = parseSeconds(item.t);
  if (!stats[name]) {
    stats[name] = { totalSec: 0, count: 0, times: [] };
  }
  if (sec > 0) {
    stats[name].totalSec += sec;
    stats[name].count += 1;
    stats[name].times.push(sec);
  }
}

console.log(JSON.stringify(stats, null, 2));
