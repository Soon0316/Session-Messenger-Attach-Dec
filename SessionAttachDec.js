const fs = require('fs');
const sodium = require('libsodium-wrappers');
const path = require('path');

//attachments,noindex 폴더 하위 파일 목록 추출
function getFilelist(path) {
  const filelist = [];
  try{
    const dirlist = fs.readdirSync(path).filter(function (file) {
        return fs.statSync(path+'/'+file).isDirectory();
    });

    for (var i = 0; i < dirlist.length; i++){
        const tempList = fs.readdirSync(path+'/'+dirlist[i], {withFileTypes: true})
        .filter(item => !item.isDirectory())
        .map(item => item.name)
    
        for (var j = 0; j < tempList.length; j++){
            filelist.push(path+'/'+dirlist[i]+'/'+tempList[j])
        }
        
    }
    return filelist;
  }
  catch(err){
    console.error(err);
  }
  return filelist;
}

// 파일을 byte 형식으로 읽고 ArrayBuffer로 변환하는 함수
function readFileAsArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(`Read File Error: ${err}`);
      } else {
        resolve(data.buffer);  // `Buffer` 객체에서 `ArrayBuffer`로 변환하여 반환
      }
    });
  });
}

// Hex 문자열을 Uint8Array로 변환하는 함수
function hexStringToUint8Array(hexString) {
  const length = hexString.length;
  const array = new Uint8Array(length / 2);

  for (let i = 0; i < length; i += 2) {
    array[i / 2] = parseInt(hexString.substr(i, 2), 16);
  }

  return array;
}

// 복호화 함수 (decryptAttachmentBufferNode)
async function decryptAttachmentBufferNode(encryptingKeyHex, bufferIn) {
  await sodium.ready;  

  const encryptingKey = hexStringToUint8Array(encryptingKeyHex);

  const header = new Uint8Array(bufferIn.slice(0, sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES));
  
  const encryptedBuffer = new Uint8Array(bufferIn.slice(sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES));

  try {
    // 복호화 스트림 초기화 (Key, IV 설정)
    const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, encryptingKey);

    // 스트림에서 메시지 복호화
    const messageTag = sodium.crypto_secretstream_xchacha20poly1305_pull(state, encryptedBuffer);
    
    if (messageTag.tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
      return messageTag.message;
    }
  } catch (e) {
    console.error('Decryption Fail:', e);
  }
  return new Uint8Array();  // 복호화 실패 시 빈 배열 반환
}

// 복호화된 데이터를 파일로 저장하는 함수
function saveDecryptedFile(outputPath, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(outputPath, Buffer.from(data), (err) => {
      if (err) {
        reject(`File save failed: ${err}`);
      } else {
        resolve('The file has been successfully saved');
      }
    });
  });
}

async function run() {
  const inputFilePath = './attachments.noindex';  // 암호화된 첨부 파일 경로(%APPDATA%/Session/attachments.noindex/)
  const outputFilePath = './output/'; // 복호화된 파일 저장 경로
  const key = 'input local_attachment_encrypted_key from db.sqlite'; // 암호화 키 (local_attachment_encrypted_key)
  const filelist = getFilelist(inputFilePath);

  console.log('======================================================================================================');
  console.log(`[+] attachments.noindex Path: ${inputFilePath}`);
  console.log(`[+] local_attachment_encrypted_key: ${key}`);
  console.log(`[+] Number of Encrypted Files: ${filelist.length}`)
  console.log('======================================================================================================');

  try {
    for (var i = 0; i < filelist.length; i++){
      const fileName = path.basename(filelist[i]);
      const dirName = fileName.substring(0,2);
      const outputfile = outputFilePath+'/'+dirName+'/'+fileName

      if (!fs.existsSync(outputFilePath+'/'+dirName)){
              fs.mkdirSync(outputFilePath+'/'+dirName,{ recursive: true })
      }

      // 암호화된 파일을 ArrayBuffer 형식으로 읽음
      const bufferIn = await readFileAsArrayBuffer(filelist[i]);
      // 복호화 수행
      const decryptedData = await decryptAttachmentBufferNode(key, bufferIn);
      if (decryptedData.length == 0){
        console.log(`   [${i+1}] Input File: ${fileName}`)
        console.log('      Status: Decryption Failure')
        console.log()
      }
      else{
        // 복호화된 데이터를 파일로 저장
        await saveDecryptedFile(outputfile, decryptedData);
  
        console.log(`   [${i+1}] Input File: ${fileName}`)
        console.log('       Status: Decryption Successful')
        console.log(`       Decrypted File Size: ${decryptedData.length} Bytes`)
        console.log()
      }
    }
    
  } catch (err) {
    console.error(err);
  }
}

run();

