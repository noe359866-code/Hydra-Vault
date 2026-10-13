/**
 * Decodificador bencode mínimo (suficiente para leer .torrent y extraer
 * el diccionario "info" y su hash SHA-1 → infoHash de magnet).
 */

function decode(buffer, start = 0, end = buffer.length) {
  // Devuelve [valor, siguienteOffset]
  if (start >= end) throw new Error('bencode: fin inesperado');

  const c = buffer[start];

  if (c === 0x69) { // 'i' entero: i<digits>e
    const eIndex = buffer.indexOf(0x65, start); // 'e'
    if (eIndex === -1) throw new Error('bencode: entero sin cerrar');
    const num = Number(buffer.toString('ascii', start + 1, eIndex));
    if (!Number.isFinite(num)) throw new Error('bencode: entero inválido');
    return [num, eIndex + 1];
  }

  if (c === 0x6c) { // 'l' lista
    const list = [];
    let pos = start + 1;
    while (pos < end && buffer[pos] !== 0x65) {
      const [value, next] = decode(buffer, pos, end);
      list.push(value);
      pos = next;
    }
    if (buffer[pos] !== 0x65) throw new Error('bencode: lista sin cerrar');
    return [list, pos + 1];
  }

  if (c === 0x64) { // 'd' diccionario
    const dict = {};
    let pos = start + 1;
    while (pos < end && buffer[pos] !== 0x65) {
      const [key, keyNext] = decode(buffer, pos, end);
      if (typeof key !== 'string') throw new Error('bencode: clave no válida');
      const [value, valueNext] = decode(buffer, keyNext, end);
      dict[key] = value;
      pos = valueNext;
    }
    if (buffer[pos] !== 0x65) throw new Error('bencode: diccionario sin cerrar');
    return [dict, pos + 1];
  }

  // Cadena: <digits>:<bytes>
  if (c >= 0x30 && c <= 0x39) {
    const colon = buffer.indexOf(0x3a, start); // ':'
    if (colon === -1) throw new Error('bencode: cadena sin longitud');
    const length = Number(buffer.toString('ascii', start, colon));
    if (!Number.isInteger(length) || length < 0) throw new Error('bencode: longitud inválida');
    const strStart = colon + 1;
    const strEnd = strStart + length;
    if (strEnd > end) throw new Error('bencode: cadena truncada');
    // Las claves/b text suelen ser UTF-8; se devuelve string utf8.
    return [buffer.toString('utf8', strStart, strEnd), strEnd];
  }

  throw new Error(`bencode: tipo desconocido (byte ${c})`);
}

/**
 * Localiza el rango exacto (start, end) del diccionario "info" dentro del buffer.
 * Necesario para calcular el SHA-1 sobre los bytes EXACTOS, sin re-serializar.
 */
function locateInfoDict(buffer) {
  // Busca "4:info" seguido de 'd'
  const marker = Buffer.from('4:info', 'ascii');
  let idx = buffer.indexOf(marker);
  while (idx !== -1) {
    const dictStart = idx + marker.length;
    if (buffer[dictStart] === 0x64) {
      // Decodifica el diccionario para saber dónde termina.
      const [, next] = decode(buffer, dictStart, buffer.length);
      return [dictStart, next];
    }
    idx = buffer.indexOf(marker, idx + 1);
  }
  throw new Error('bencode: diccionario "info" no encontrado');
}

module.exports = { decode, locateInfoDict };
