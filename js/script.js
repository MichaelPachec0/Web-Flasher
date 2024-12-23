let espStub;

const baudRates = [921600, 115200, 230400, 460800];

const bufferSize = 512;
const colors = ["#00a7e9", "#f89521", "#be1e2d"];
const measurementPeriodId = "0001";

const maxLogLength = 100;
const log = document.getElementById("log");
const butConnect = document.getElementById("butConnect");
const baudRate = document.getElementById("baudRate");
const butClear = document.getElementById("butClear");
const butErase = document.getElementById("butErase");
const butProgram = document.getElementById("butProgram");
const autoscroll = document.getElementById("autoscroll");
const firmware = document.querySelectorAll(".upload .firmware input");
const progress = document.querySelectorAll(".upload .progress");
const offsets = document.querySelectorAll(".upload .offset");
const appDiv = document.getElementById("app");
const dropBtn = document.getElementById("dropdownMenuButton");
const upload = document.getElementById("custom-fw");
const modelBtn = document.getElementById("dropdown-model");

/**
 * @type {Map<string,Map<string,string>>}
 * TODO: Move this away from global when possible
 */
let fwMap;

let ghURL = "";

document.addEventListener("DOMContentLoaded", async () => {
  butConnect.addEventListener("click", () => {
    clickConnect().catch(async (e) => {
      console.error(e);
      errorMsg(e.message || e);
      if (espStub) {
        await espStub.disconnect();
      }
      toggleUIConnected(false);
    });
  });
  butClear.addEventListener("click", clickClear);
  butErase.addEventListener("click", clickErase);
  butProgram.addEventListener("click", fwProgram);
  for (let i = 0; i < firmware.length; i++) {
    firmware[i].addEventListener("change", checkFirmware);
  }
  for (let i = 0; i < offsets.length; i++) {
    offsets[i].addEventListener("change", checkProgrammable);
  }
  dropBtn.addEventListener("click", async (ev) => {
    await menuHandler(ev);
  });
  autoscroll.addEventListener("click", clickAutoscroll);
  baudRate.addEventListener("change", changeBaudRate);
  window.addEventListener("error", function (event) {
    console.log("Got an uncaught error: ", event.error);
  });
  if ("serial" in navigator) {
    // const notSupported = document.getElementById("notSupported");
    // notSupported.classList.add("hidden");
  } else {
    let myModal = new bootstrap.Modal(
      document.getElementById("staticBackdrop"),
      {}
    );
    document.getElementsByClassName("btn-close")[0].classList.add("hidden");
    myModal.show();
  }

  const fwList = document.getElementById("fw-dropdown");
  if (fwList === null) {
    // TODO: better error checking and bubbling up to the user?
    console.log("list isn't present!");
    return;
  }
  const divider = document.getElementById("divider");
  if (divider === null) {
    console.log("NO DIVIDER");
    return;
  }

  // TODO: move this to its own function?
  // break this into separate try catch?
  try {
    const resp = await fetch("data/firmwareRepositories.csv");
    const text = await resp.text();
    fwMap = csvParse(text);
  } catch (err) {
    console.log(err);
    // TODO: meaningful logic here
    return;
  }
  for (const fw of fwMap.keys()) {
    let fwElement = document.createElement("li");
    const textElement = document.createElement("a");
    textElement.innerText = fw;
    textElement.classList.add(["dropdown-item"]);
    textElement.id = fw;
    fwElement.appendChild(textElement);
    fwList.insertBefore(fwElement, divider);
  }

  const dropdownItems = document.querySelectorAll(".dropdown-item");

  // Add event listener to each dropdown item
  dropdownItems.forEach(function (item) {
    item.addEventListener("click", async (event) => {
      event.preventDefault(); // Prevent default link behavior
      const modelList = document.getElementById("model-dropdown");
      const modelSel = document.getElementById("model-selection");
      const text = item.id;
      const fwText = text == "custom" ? "Custom" : text;
      dropBtn.innerText = `Firmware: ${fwText}`;
      // make sure its clear.
      modelList.innerText = "";
      // and hidden
      modelSel.hidden = true;
      // clear selection, in case the user will go from choosing a gh release to custom fw
      modelBtn.innerText = "Model";

      if (text === "custom") {
        // make sure that model dropdown is hidden and the custom fw upload is not hidden
        // the rest of the logic after the branch is unneeded, so return early
        modelList.hidden = true;
        upload.hidden = false;
        butProgram.disabled = true;
        return;
      } else {
        // make sure that upload is not enabled
        upload.hidden = true;
        modelList.hidden = false;
      }

      const repoUrl = fwMap.get(text).get("LINK");
      if (typeof repoUrl === "undefined") {
        console.log(`URL ${repoUrl} for chosen fw ${text} does not exist!`);
        return;
      }
      const assetUrl = `https://api.github.com/repos/DevKitty-io/${text}/releases/latest`;
      console.log(
        `DROPDOWN PICKED ${text} with url ${repoUrl} and asset url ${assetUrl}`
      );
      // TODO: caching of elements, invalidation based on response?
      const resp = await fetch(assetUrl);
      if (!resp.ok) {
        // TODO: there should be a message that alerts the user to check back later.
        //   something like "Firmware not available yet, check back soon!"
        console.log(`URL ${repoUrl} for chosen fw ${text} does not exist!`);
        // make sure that the program button is disabled
        butProgram.disabled = true;
        return;
      }
      const latestRelJSON = JSON.parse(await resp.text());
      // const relJSON = JSON.stringify(latestRelJSON);
      // console.log(`${relJSON}`);
      const relAssets = latestRelJSON.assets;

      if (relAssets.length === 0) {
        console.log("No assets");
        modelSel.hidden = true;
      }
      console.log(relAssets.length);
      console.log(relAssets);
      for (let fwModel of relAssets) {
        let modelElem = document.createElement("li");
        let download = fwModel.browser_download_url;
        if (download === "") {
          console.log("NO DOWNLOAD?!");
          // make sure we don't make the dropdown visible
          modelSel.hidden = true;
          continue;
        }
        console.log(fwModel);
        console.log(fwModel.browser_download_url);
        modelElem.innerText = fwModel.name;
        modelElem.setAttribute("data-download", fwModel.browser_download_url);
        modelElem.classList.add(["dropdown-item"]);
        console.log(`fwModel: ${modelElem.innerText}`);

        modelElem.addEventListener("click", async (ev) => {
          // should there be more logic here? the program button logic takes care of download
          // and i don't want to have another global.

          ghURL = modelElem.getAttribute("data-download");
          modelBtn.innerText = `Model: ${modelElem.innerText}`;
          butProgram.disabled = false;
          butErase.disabled = false;
        });
        modelList.append(modelElem);
        modelSel.hidden = false;
      }
    });
  });

  initBaudRate();
  loadAllSettings();
  logMsg("ESP Web Flasher loaded.");
});

/**
 * Function to parse CSV data.
 * @param {string} text CSV file content as a string.
 * @returns {Map<string,Map<string,string>>} Parsed mapped by fw to relevant data bits
 */
function csvParse(csv) {
  const dict = new Map();
  const rows = csv.split("\n");
  const descRow = rows[0].split(",");
  for (let idx = 1; idx < rows.length; idx++) {
    const row = rows[idx].split(",");
    const data = new Map();
    for (let dataIdx = 1; dataIdx < row.length; dataIdx++) {
      data.set(descRow[dataIdx], stripQuotes(row[dataIdx]));
    }
    const key = stripQuotes(row[0]);
    console.log(data);
    dict.set(key, data);
  }
  return dict;
}

/**
 * Function to normalize text ie remove quotes.
 * @param {string} text string that might contain quotes.
 * @returns {string} cleaned string that does not include quotes.
 */
function stripQuotes(text) {
  if (text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') {
    return text.slice(1, -1);
  }
  return text;
}
function initBaudRate() {
  for (let rate of baudRates) {
    var option = document.createElement("option");
    option.text = rate + " Baud";
    option.value = rate;
    baudRate.add(option);
  }
}

function logMsg(text) {
  log.innerHTML += text + "<br>";

  // Remove old log content
  if (log.textContent.split("\n").length > maxLogLength + 1) {
    let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
    log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
  }

  if (autoscroll.checked) {
    log.scrollTop = log.scrollHeight;
  }
}

function debugMsg(...args) {
  function getStackTrace() {
    let stack = new Error().stack;
    //console.log(stack);
    stack = stack.split("\n").map((v) => v.trim());
    stack.shift();
    stack.shift();

    let trace = [];
    for (let line of stack) {
      line = line.replace("at ", "");
      trace.push({
        // WARN: substr function calling below is deprecated, fix
        func: line.substr(0, line.indexOf("(") - 1),
        pos: line.substring(line.indexOf(".js:") + 4, line.lastIndexOf(":")),
      });
    }

    return trace;
  }

  let stack = getStackTrace();
  stack.shift();
  let top = stack.shift();
  let prefix =
    '<span class="debug-function">[' + top.func + ":" + top.pos + "]</span> ";
  for (let arg of args) {
    if (typeof arg == "string") {
      logMsg(prefix + arg);
    } else if (typeof arg == "number") {
      logMsg(prefix + arg);
    } else if (typeof arg == "boolean") {
      logMsg(prefix + arg ? "true" : "false");
    } else if (Array.isArray(arg)) {
      logMsg(prefix + "[" + arg.map((value) => toHex(value)).join(", ") + "]");
    } else if (typeof arg == "object" && arg instanceof Uint8Array) {
      logMsg(
        prefix +
          "[" +
          Array.from(arg)
            .map((value) => toHex(value))
            .join(", ") +
          "]"
      );
    } else {
      logMsg(prefix + "Unhandled type of argument:" + typeof arg);
      console.log(arg);
    }
    prefix = ""; // Only show for first argument
  }
}

function errorMsg(text) {
  logMsg('<span class="error-message">Error:</span> ' + text);
  console.log(text);
}

function enableStyleSheet(node, enabled) {
  node.disabled = !enabled;
}

function formatMacAddr(macAddr) {
  return macAddr
    .map((value) => value.toString(16).toUpperCase().padStart(2, "0"))
    .join(":");
}

/**
 * @name clickConnect
 * Click handler for the connect/disconnect button.
 */
async function clickConnect() {
  if (espStub) {
    await espStub.disconnect();
    await espStub.port.close();
    toggleUIConnected(false);
    espStub = undefined;
    return;
  }

  const esploaderMod = await window.esptoolPackage;

  // refer to  index.ts:17
  const esploader = await esploaderMod.connect({
    log: (...args) => logMsg(...args),
    debug: (...args) => debugMsg(...args),
    error: (...args) => errorMsg(...args),
  });
  try {
    // refer to  esp_loader.ts:77
    await esploader.initialize();

    // this get set in esp_loader.ts:90 after initialize() gets exec
    logMsg("Connected to " + esploader.chipName);
    logMsg("MAC Address: " + formatMacAddr(esploader.macAddr()));

    // refer to  esp_loader.ts:1026
    espStub = await esploader.runStub();
    toggleUIConnected(true);
    toggleUIToolbar(true);
    espStub.addEventListener("disconnect", () => {
      toggleUIConnected(false);
      espStub = false;
    });
  } catch (err) {
    await esploader.disconnect();
    throw err;
  }
}

/**
 * @name changeBaudRate
 * Change handler for the Baud Rate selector.
 */
async function changeBaudRate() {
  console.log("here");
  saveSetting("baudrate", baudRate.value);
  document.getElementById("baudRateText").innerHTML = baudRate.value;
  if (espStub) {
    let baud = parseInt(baudRate.value);
    if (baudRates.includes(baud)) {
      await espStub.setBaudrate(baud);
    }
  }
}

/**
 * @name clickAutoscroll
 * Change handler for the Autoscroll checkbox.
 */
async function clickAutoscroll() {
  saveSetting("autoscroll", autoscroll.checked);
}

/**
 * @name clickErase
 * Click handler for the erase button.
 */
async function clickErase() {
  if (
    window.confirm("This will erase the entire flash. Click OK to continue.")
  ) {
    baudRate.disabled = true;
    butErase.disabled = true;
    butProgram.disabled = true;
    try {
      logMsg("Erasing flash memory. Please wait...");
      let stamp = Date.now();
      await espStub.eraseFlash();
      logMsg("Finished. Took " + (Date.now() - stamp) + "ms to erase.");
    } catch (e) {
      errorMsg(e);
    } finally {
      butErase.disabled = false;
      baudRate.disabled = false;

      const validFiles = getValidFiles();
      butProgram.disabled = validFiles.length == 0;
    }
  }
}
/**
 * @name readUploadedFileAsArrayBuffer
 *
 * Reads the uploaded file as an ArrayBuffer.
 *
 * This function utilizes the FileReader API to read a file as an ArrayBuffer, which allows binary data to be processed.
 * It returns a Promise that resolves with the ArrayBuffer result or rejects if an error occurs during the reading process.
 *
 * @param {File} inputFile - The file input from the user that needs to be read.
 * @returns {Promise<ArrayBuffer>} A promise that resolves with the file's ArrayBuffer content, or rejects with a DOMException on error.
 *
 * @throws {DOMException} If an error occurs while reading the file.
 *
 */
async function readUploadedFileAsArrayBuffer(inputFile) {
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onerror = () => {
      reader.abort();
      reject(new DOMException("Problem parsing input file."));
    };

    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(inputFile);
  });
}
async function fwProgram() {
  const isCustom = !upload.hidden;
  console.log(`CUSTOM: ${isCustom}`);
  isCustom ? await customFwProgram() : await ghRelFwProgram();
}
async function ghRelFwProgram() {
  // I don't want this here, i want this once the user wants to program the device! this for now is not prod code
  // might bubbling a down, maybe setup a button? to the side saying download?

  // WARN: THIS IS ONLY FOR DEV, YOU NEED TO GET PERMS TO USE.
  // only use cors proxy if this is not prod
  // TODO: setup separate cors anywhere proxy
  const proxy = "https://cors-anywhere.herokuapp.com";
  const localUrl =
    window.location.hostname === "localhost" ? `${proxy}/${ghURL}` : ghURL;

  const binReq = fetch(localUrl);
  // decide how far we want to push this out.
  const binResp = await binReq;
  if (!binResp.ok) {
    // TODO: decide if this is recoverable
    console.log("download failed!");
    return;
  }
  const buf = binResp.arrayBuffer();
  await clickProgramHelper(false, buf);
}

async function customFwProgram() {
  // not needed by both routes this is custom fw specific
  firmware[0].disabled = true;
  // not needed by both routes this is custom fw specific
  offsets[0].disabled = true;

  // the webapp only allows for one bin file, should be
  let binCheck = getValidFiles();
  if (binCheck.length != 1) {
    // this should not happen since the webapp only for one bin file, the only other possible option is
    // if there is no file, this is meant to catch that!
    console.log(
      `Error: incorrect number of binaries: expected 1 got ${binCheck.length} bins: [${binCheck}]`
    );
  }

  let binFile = firmware[0].files[0];
  try {
    let contents = readUploadedFileAsArrayBuffer(binFile);
    clickProgramHelper(true, contents);
  } catch (e) {
    errorMsg(e);
  }
  // not needed by both routes this is custom fw specific
  firmware[0].disabled = false;
  // not needed by both routes this is custom fw specific
  offsets[0].disabled = false;
}

// const clickProgramHelper = async (custom, buf) => {
/**
 * @name clickProgramHelper
 * Click handler for the program button.
 * @param {boolean} custom - Whether or not this is a custom upload
 * @param {Promise<ArrayBuffer>} buf - fw buffer
 *
 */
async function clickProgramHelper(custom, buf) {
  let validFiles = custom ? getValidFiles() : [0];
  // needed by both routes
  baudRate.disabled = true;
  // needed by both routes
  butErase.disabled = true;
  // needed by both routes
  butProgram.disabled = true;
  for (let file of validFiles) {
    progress[file].classList.remove("hidden");
    let contents = await buf;
    try {
      let offset = custom ? parseInt(offsets[file].value, 16) : 0;
      const progressBar = progress[file].querySelector("div");
      await espStub.flashData(
        contents,
        (bytesWritten, totalBytes) => {
          const rawProgress = bytesWritten / totalBytes;
          progressBar.style.width = Math.floor(rawProgress * 100) + "%";
        },
        offset
      );
      await sleep(100);
    } catch (e) {
      errorMsg(e);
    }
  }
  // progress[0]
  // needed by both routes
  baudRate.disabled = false;
  // needed by both routes
  butErase.disabled = false;
  // needed by both routes
  butProgram.disabled = custom ? getValidFiles().length == 0 : false;
  logMsg("To run the new firmware, please reset your device.");
}

/**
 * @name clickProgram
 * Click handler for the program button.
 */
async function clickProgram() {
  /**
   * Reads the uploaded file as an ArrayBuffer.
   *
   * This function utilizes the FileReader API to read a file as an ArrayBuffer, which allows binary data to be processed.
   * It returns a Promise that resolves with the ArrayBuffer result or rejects if an error occurs during the reading process.
   *
   * @param {File} inputFile - The file input from the user that needs to be read.
   * @returns {Promise<ArrayBuffer>} A promise that resolves with the file's ArrayBuffer content, or rejects with a DOMException on error.
   *
   * @throws {DOMException} If an error occurs while reading the file.
   *
   */
  const readUploadedFileAsArrayBuffer = (inputFile) => {
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onerror = () => {
        reader.abort();
        reject(new DOMException("Problem parsing input file."));
      };

      reader.onload = () => {
        resolve(reader.result);
      };
      reader.readAsArrayBuffer(inputFile);
    });
  };

  // needed by both routes
  baudRate.disabled = true;
  butErase.disabled = true;
  butProgram.disabled = true;

  // for (let i = 0; i < 4; i++) {
    firmware[0].disabled = true;
    offsets[0].disabled = true;
  // }
  // not needed by both routes this is custom fw specific
  const validFiles = getValidFiles();
  console.log(`PRGM: validFiles:`);
  // there should only be one entry here?
  console.log(validFiles);

  console.log(progress);

  console.log(firmware);
  // offsets counter
  console.log(offsets);

  // not needed by both routes this is custom fw specific, since there is only one
  // bin file needed in the releases tab, assume this does not change
  for (let file of validFiles) {
    // this needs to be changed as both
    progress[file].classList.remove("hidden");
    // the bottom two lines wont be needed by gh release version.
    let binFile = firmware[file].files[0];
    let contents = await readUploadedFileAsArrayBuffer(binFile);
    console.log(contents);
    // this is where the custom fw specific parts end, need to break this part off
    try {
      let offset = parseInt(offsets[file].value, 16);
      const progressBar = progress[file].querySelector("div");
      // if there no esp connected, this errors out
      // refer to  esp_loader.ts l:535
      await espStub.flashData(
        contents,
        (bytesWritten, totalBytes) => {
          progressBar.style.width =
            Math.floor((bytesWritten / totalBytes) * 100) + "%";
        },
        offset
      );
      await sleep(100);
    } catch (e) {
      errorMsg(e);
    }
  }
  // for (let i = 0; i < 4; i++) {
    firmware[0].disabled = false;
    offsets[0].disabled = false;
    progress[0].classList.add("hidden");
    progress[0].querySelector("div").style.width = "0";
  // }
  butErase.disabled = false;
  baudRate.disabled = false;
  butProgram.disabled = getValidFiles().length == 0;
  logMsg("To run the new firmware, please reset your device.");
}
async function menuHandler(ev) {
  console.log(ev);
}

function getValidFiles() {
  // Get a list of file and offsets
  // This will be used to check if we have valid stuff
  // and will also return a list of files to program
  let validFiles = [];
  let offsetVals = [];
  // for (let i = 0; i < 4; i++) {
    let offs = parseInt(offsets[0].value, 16);
    if (firmware[0].files.length > 0 && !offsetVals.includes(offs)) {
      validFiles.push(0);
      offsetVals.push(offs);
    }
  // }
  return validFiles;
}

/**
 * @name checkProgrammable
 * Check if the conditions to program the device are sufficient
 */
async function checkProgrammable() {
  butProgram.disabled = getValidFiles().length == 0;
}

/**
 * @name checkFirmware
 * Handler for firmware upload changes
 */
async function checkFirmware(event) {
  let filename = event.target.value.split("\\").pop();
  // let label = event.target.parentNode.querySelector("span");
  let icon = event.target.parentNode.querySelector("svg");
  if (filename != "") {
    if (filename.length > 17) {
      // label.innerHTML = filename.substring(0, 14) + "&hellip;";
    } else {
      // label.innerHTML = filename;
    }
    // icon.classList.add("hidden");
  } else {
    label.innerHTML = "Choose a file&hellip;";
    // icon.classList.remove("hidden");
  }

  await checkProgrammable();
}

/**
 * @name clickClear
 * Click handler for the clear button.
 */
async function clickClear() {
  reset();
}

function convertJSON(chunk) {
  try {
    let jsonObj = JSON.parse(chunk);
    return jsonObj;
  } catch (e) {
    return chunk;
  }
}

function toggleUIToolbar(show) {
  isConnected = show;
  // for (let i = 0; i < 4; i++) {
    // progress[0].classList.add("hidden");
    // progress[0].querySelector("div").style.width = "0";
  // }
  if (show) {
    appDiv.classList.add("connected");
  } else {
    appDiv.classList.remove("connected");
  }
  butErase.disabled = !show;
}

function toggleUIConnected(connected) {
  let lbl = "Connect";
  document.getElementById("status").classList = "";
  document.getElementById("status").classList.add("bg-danger");

  if (connected) {
    lbl = "Disconnect";
    document.getElementById("status").classList = "";
    document.getElementById("status").classList.add("bg-success");
  } else {
    toggleUIToolbar(false);
  }
  butConnect.textContent = lbl;
}

function loadAllSettings() {
  // Load all saved settings or defaults
  autoscroll.checked = loadSetting("autoscroll", true);
  baudRate.value = loadSetting("baudrate", 115200);
}

function loadSetting(setting, defaultValue) {
  let value = JSON.parse(window.localStorage.getItem(setting));
  if (value == null) {
    return defaultValue;
  }

  return value;
}

function saveSetting(setting, value) {
  window.localStorage.setItem(setting, JSON.stringify(value));
}

function ucWords(text) {
  return text
    .replace("_", " ")
    .toLowerCase()
    .replace(/(?<= )[^\s]|^./g, (a) => a.toUpperCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reset() {
  document.getElementById("log").innerHTML = "";
}
