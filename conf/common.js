function cleanLine(line) {
    return line.replace(/:\/\//g, '___URL___').split('//')[0].replace(/___URL___/g, '://').trim();
}
