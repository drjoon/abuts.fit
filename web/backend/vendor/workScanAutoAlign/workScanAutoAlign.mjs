import require$$0 from "stream";
import require$$2 from "events";
import require$$0$1 from "buffer";
import require$$1 from "util";
function bytesToBase64(bytes) {
  const chunk = 32768;
  const parts = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    parts.push(String.fromCharCode.apply(null, slice));
  }
  return btoa(parts.join(""));
}
function copyBytes(view) {
  const out2 = new Uint8Array(view.byteLength);
  out2.set(
    new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  );
  return out2;
}
function encodeFaces(indices) {
  const faceCount = Math.floor(indices.length / 3);
  const bytes = new Uint8Array(faceCount * 13);
  const view = new DataView(bytes.buffer);
  for (let face = 0; face < faceCount; face += 1) {
    const at = face * 13;
    bytes[at] = 6;
    view.setUint32(at + 1, indices[face * 3], true);
    view.setUint32(at + 5, indices[face * 3 + 1], true);
    view.setUint32(at + 9, indices[face * 3 + 2], true);
  }
  return { bytes, faceCount };
}
function linearColorsToSrgbBytes(color) {
  const out2 = new Uint8Array(color.count * 3);
  const tmp = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < color.count; i += 1) {
    const encoded = linearToSrgb(
      color.getX(i),
      color.getY(i),
      color.getZ(i),
      tmp
    );
    const o2 = i * 3;
    out2[o2] = encoded.r;
    out2[o2 + 1] = encoded.g;
    out2[o2 + 2] = encoded.b;
  }
  return out2;
}
function linearToSrgb(r2, g, b2, into) {
  into.r = channelByte(r2);
  into.g = channelByte(g);
  into.b = channelByte(b2);
  return into;
}
function channelByte(linear) {
  const x = Math.min(1, Math.max(0, linear));
  const s2 = x <= 31308e-7 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s2)) * 255);
}
function encodeHpsCaDcm(mesh) {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const positions = mesh.positions.subarray(0, vertexCount * 3);
  const { bytes: faceBytes, faceCount } = encodeFaces(mesh.indices);
  const vertexBytes = copyBytes(positions);
  const colors = mesh.colors;
  const colorBlock = colors && colors.length >= vertexCount * 3 ? `<VertexColorSets><VertexColorSet>${bytesToBase64(swapRgbToBgr(colors.subarray(0, vertexCount * 3)))}</VertexColorSet></VertexColorSets>` : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?><HPS version="1.1"><Schema>CA</Schema><Properties><Property name="abuts.work" value="1"/></Properties><Vertices vertex_count="${vertexCount}">${bytesToBase64(vertexBytes)}</Vertices><Facets facet_count="${faceCount}">${bytesToBase64(faceBytes)}</Facets>` + colorBlock + `</HPS>`;
  return new Blob([xml], { type: "application/octet-stream" });
}
function swapRgbToBgr(rgb) {
  const out2 = new Uint8Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    out2[i] = rgb[i + 2];
    out2[i + 1] = rgb[i + 1];
    out2[i + 2] = rgb[i];
  }
  return out2;
}
/**
 * @license
 * Copyright 2010-2025 Three.js Authors
 * SPDX-License-Identifier: MIT
 */
const REVISION = "181";
const FrontSide = 0;
const BackSide = 1;
const NormalBlending = 1;
const AddEquation = 100;
const SrcAlphaFactor = 204;
const OneMinusSrcAlphaFactor = 205;
const LessEqualDepth = 3;
const MultiplyOperation = 0;
const UVMapping = 300;
const RepeatWrapping = 1e3;
const ClampToEdgeWrapping = 1001;
const MirroredRepeatWrapping = 1002;
const LinearFilter = 1006;
const LinearMipmapLinearFilter = 1008;
const UnsignedByteType = 1009;
const FloatType = 1015;
const RGBAFormat = 1023;
const TangentSpaceNormalMap = 0;
const NoColorSpace = "";
const SRGBColorSpace = "srgb";
const LinearSRGBColorSpace = "srgb-linear";
const LinearTransfer = "linear";
const SRGBTransfer = "srgb";
const KeepStencilOp = 7680;
const AlwaysStencilFunc = 519;
const StaticDrawUsage = 35044;
const WebGLCoordinateSystem = 2e3;
const WebGPUCoordinateSystem = 2001;
function arrayNeedsUint32(array) {
  for (let i = array.length - 1; i >= 0; --i) {
    if (array[i] >= 65535) return true;
  }
  return false;
}
function createElementNS(name) {
  return document.createElementNS("http://www.w3.org/1999/xhtml", name);
}
const _cache = {};
function warn(...params) {
  const message = "THREE." + params.shift();
  {
    console.warn(message, ...params);
  }
}
function error(...params) {
  const message = "THREE." + params.shift();
  {
    console.error(message, ...params);
  }
}
function warnOnce(...params) {
  const message = params.join(" ");
  if (message in _cache) return;
  _cache[message] = true;
  warn(...params);
}
class EventDispatcher {
  /**
   * Adds the given event listener to the given event type.
   *
   * @param {string} type - The type of event to listen to.
   * @param {Function} listener - The function that gets called when the event is fired.
   */
  addEventListener(type, listener) {
    if (this._listeners === void 0) this._listeners = {};
    const listeners = this._listeners;
    if (listeners[type] === void 0) {
      listeners[type] = [];
    }
    if (listeners[type].indexOf(listener) === -1) {
      listeners[type].push(listener);
    }
  }
  /**
   * Returns `true` if the given event listener has been added to the given event type.
   *
   * @param {string} type - The type of event.
   * @param {Function} listener - The listener to check.
   * @return {boolean} Whether the given event listener has been added to the given event type.
   */
  hasEventListener(type, listener) {
    const listeners = this._listeners;
    if (listeners === void 0) return false;
    return listeners[type] !== void 0 && listeners[type].indexOf(listener) !== -1;
  }
  /**
   * Removes the given event listener from the given event type.
   *
   * @param {string} type - The type of event.
   * @param {Function} listener - The listener to remove.
   */
  removeEventListener(type, listener) {
    const listeners = this._listeners;
    if (listeners === void 0) return;
    const listenerArray = listeners[type];
    if (listenerArray !== void 0) {
      const index2 = listenerArray.indexOf(listener);
      if (index2 !== -1) {
        listenerArray.splice(index2, 1);
      }
    }
  }
  /**
   * Dispatches an event object.
   *
   * @param {Object} event - The event that gets fired.
   */
  dispatchEvent(event) {
    const listeners = this._listeners;
    if (listeners === void 0) return;
    const listenerArray = listeners[event.type];
    if (listenerArray !== void 0) {
      event.target = this;
      const array = listenerArray.slice(0);
      for (let i = 0, l2 = array.length; i < l2; i++) {
        array[i].call(this, event);
      }
      event.target = null;
    }
  }
}
const _lut = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "1a", "1b", "1c", "1d", "1e", "1f", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "3a", "3b", "3c", "3d", "3e", "3f", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "4a", "4b", "4c", "4d", "4e", "4f", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "5a", "5b", "5c", "5d", "5e", "5f", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "6a", "6b", "6c", "6d", "6e", "6f", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "7a", "7b", "7c", "7d", "7e", "7f", "80", "81", "82", "83", "84", "85", "86", "87", "88", "89", "8a", "8b", "8c", "8d", "8e", "8f", "90", "91", "92", "93", "94", "95", "96", "97", "98", "99", "9a", "9b", "9c", "9d", "9e", "9f", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "aa", "ab", "ac", "ad", "ae", "af", "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "ba", "bb", "bc", "bd", "be", "bf", "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "ca", "cb", "cc", "cd", "ce", "cf", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "da", "db", "dc", "dd", "de", "df", "e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "ea", "eb", "ec", "ed", "ee", "ef", "f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "fa", "fb", "fc", "fd", "fe", "ff"];
function generateUUID() {
  const d0 = Math.random() * 4294967295 | 0;
  const d1 = Math.random() * 4294967295 | 0;
  const d2 = Math.random() * 4294967295 | 0;
  const d3 = Math.random() * 4294967295 | 0;
  const uuid = _lut[d0 & 255] + _lut[d0 >> 8 & 255] + _lut[d0 >> 16 & 255] + _lut[d0 >> 24 & 255] + "-" + _lut[d1 & 255] + _lut[d1 >> 8 & 255] + "-" + _lut[d1 >> 16 & 15 | 64] + _lut[d1 >> 24 & 255] + "-" + _lut[d2 & 63 | 128] + _lut[d2 >> 8 & 255] + "-" + _lut[d2 >> 16 & 255] + _lut[d2 >> 24 & 255] + _lut[d3 & 255] + _lut[d3 >> 8 & 255] + _lut[d3 >> 16 & 255] + _lut[d3 >> 24 & 255];
  return uuid.toLowerCase();
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function euclideanModulo(n2, m) {
  return (n2 % m + m) % m;
}
function lerp(x, y, t2) {
  return (1 - t2) * x + t2 * y;
}
function denormalize(value, array) {
  switch (array.constructor) {
    case Float32Array:
      return value;
    case Uint32Array:
      return value / 4294967295;
    case Uint16Array:
      return value / 65535;
    case Uint8Array:
      return value / 255;
    case Int32Array:
      return Math.max(value / 2147483647, -1);
    case Int16Array:
      return Math.max(value / 32767, -1);
    case Int8Array:
      return Math.max(value / 127, -1);
    default:
      throw new Error("Invalid component type.");
  }
}
function normalize(value, array) {
  switch (array.constructor) {
    case Float32Array:
      return value;
    case Uint32Array:
      return Math.round(value * 4294967295);
    case Uint16Array:
      return Math.round(value * 65535);
    case Uint8Array:
      return Math.round(value * 255);
    case Int32Array:
      return Math.round(value * 2147483647);
    case Int16Array:
      return Math.round(value * 32767);
    case Int8Array:
      return Math.round(value * 127);
    default:
      throw new Error("Invalid component type.");
  }
}
class Vector2 {
  /**
   * Constructs a new 2D vector.
   *
   * @param {number} [x=0] - The x value of this vector.
   * @param {number} [y=0] - The y value of this vector.
   */
  constructor(x = 0, y = 0) {
    Vector2.prototype.isVector2 = true;
    this.x = x;
    this.y = y;
  }
  /**
   * Alias for {@link Vector2#x}.
   *
   * @type {number}
   */
  get width() {
    return this.x;
  }
  set width(value) {
    this.x = value;
  }
  /**
   * Alias for {@link Vector2#y}.
   *
   * @type {number}
   */
  get height() {
    return this.y;
  }
  set height(value) {
    this.y = value;
  }
  /**
   * Sets the vector components.
   *
   * @param {number} x - The value of the x component.
   * @param {number} y - The value of the y component.
   * @return {Vector2} A reference to this vector.
   */
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  /**
   * Sets the vector components to the same value.
   *
   * @param {number} scalar - The value to set for all vector components.
   * @return {Vector2} A reference to this vector.
   */
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    return this;
  }
  /**
   * Sets the vector's x component to the given value
   *
   * @param {number} x - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setX(x) {
    this.x = x;
    return this;
  }
  /**
   * Sets the vector's y component to the given value
   *
   * @param {number} y - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setY(y) {
    this.y = y;
    return this;
  }
  /**
   * Allows to set a vector component with an index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y.
   * @param {number} value - The value to set.
   * @return {Vector2} A reference to this vector.
   */
  setComponent(index2, value) {
    switch (index2) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      default:
        throw new Error("index is out of range: " + index2);
    }
    return this;
  }
  /**
   * Returns the value of the vector component which matches the given index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y.
   * @return {number} A vector component value.
   */
  getComponent(index2) {
    switch (index2) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      default:
        throw new Error("index is out of range: " + index2);
    }
  }
  /**
   * Returns a new vector with copied values from this instance.
   *
   * @return {Vector2} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.x, this.y);
  }
  /**
   * Copies the values of the given vector to this instance.
   *
   * @param {Vector2} v - The vector to copy.
   * @return {Vector2} A reference to this vector.
   */
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }
  /**
   * Adds the given vector to this instance.
   *
   * @param {Vector2} v - The vector to add.
   * @return {Vector2} A reference to this vector.
   */
  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  /**
   * Adds the given scalar value to all components of this instance.
   *
   * @param {number} s - The scalar to add.
   * @return {Vector2} A reference to this vector.
   */
  addScalar(s2) {
    this.x += s2;
    this.y += s2;
    return this;
  }
  /**
   * Adds the given vectors and stores the result in this instance.
   *
   * @param {Vector2} a - The first vector.
   * @param {Vector2} b - The second vector.
   * @return {Vector2} A reference to this vector.
   */
  addVectors(a2, b2) {
    this.x = a2.x + b2.x;
    this.y = a2.y + b2.y;
    return this;
  }
  /**
   * Adds the given vector scaled by the given factor to this instance.
   *
   * @param {Vector2} v - The vector.
   * @param {number} s - The factor that scales `v`.
   * @return {Vector2} A reference to this vector.
   */
  addScaledVector(v, s2) {
    this.x += v.x * s2;
    this.y += v.y * s2;
    return this;
  }
  /**
   * Subtracts the given vector from this instance.
   *
   * @param {Vector2} v - The vector to subtract.
   * @return {Vector2} A reference to this vector.
   */
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  /**
   * Subtracts the given scalar value from all components of this instance.
   *
   * @param {number} s - The scalar to subtract.
   * @return {Vector2} A reference to this vector.
   */
  subScalar(s2) {
    this.x -= s2;
    this.y -= s2;
    return this;
  }
  /**
   * Subtracts the given vectors and stores the result in this instance.
   *
   * @param {Vector2} a - The first vector.
   * @param {Vector2} b - The second vector.
   * @return {Vector2} A reference to this vector.
   */
  subVectors(a2, b2) {
    this.x = a2.x - b2.x;
    this.y = a2.y - b2.y;
    return this;
  }
  /**
   * Multiplies the given vector with this instance.
   *
   * @param {Vector2} v - The vector to multiply.
   * @return {Vector2} A reference to this vector.
   */
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    return this;
  }
  /**
   * Multiplies the given scalar value with all components of this instance.
   *
   * @param {number} scalar - The scalar to multiply.
   * @return {Vector2} A reference to this vector.
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }
  /**
   * Divides this instance by the given vector.
   *
   * @param {Vector2} v - The vector to divide.
   * @return {Vector2} A reference to this vector.
   */
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    return this;
  }
  /**
   * Divides this vector by the given scalar.
   *
   * @param {number} scalar - The scalar to divide.
   * @return {Vector2} A reference to this vector.
   */
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  /**
   * Multiplies this vector (with an implicit 1 as the 3rd component) by
   * the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to apply.
   * @return {Vector2} A reference to this vector.
   */
  applyMatrix3(m) {
    const x = this.x, y = this.y;
    const e2 = m.elements;
    this.x = e2[0] * x + e2[3] * y + e2[6];
    this.y = e2[1] * x + e2[4] * y + e2[7];
    return this;
  }
  /**
   * If this vector's x or y value is greater than the given vector's x or y
   * value, replace that value with the corresponding min value.
   *
   * @param {Vector2} v - The vector.
   * @return {Vector2} A reference to this vector.
   */
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    return this;
  }
  /**
   * If this vector's x or y value is less than the given vector's x or y
   * value, replace that value with the corresponding max value.
   *
   * @param {Vector2} v - The vector.
   * @return {Vector2} A reference to this vector.
   */
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    return this;
  }
  /**
   * If this vector's x or y value is greater than the max vector's x or y
   * value, it is replaced by the corresponding value.
   * If this vector's x or y value is less than the min vector's x or y value,
   * it is replaced by the corresponding value.
   *
   * @param {Vector2} min - The minimum x and y values.
   * @param {Vector2} max - The maximum x and y values in the desired range.
   * @return {Vector2} A reference to this vector.
   */
  clamp(min, max) {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    return this;
  }
  /**
   * If this vector's x or y values are greater than the max value, they are
   * replaced by the max value.
   * If this vector's x or y values are less than the min value, they are
   * replaced by the min value.
   *
   * @param {number} minVal - The minimum value the components will be clamped to.
   * @param {number} maxVal - The maximum value the components will be clamped to.
   * @return {Vector2} A reference to this vector.
   */
  clampScalar(minVal, maxVal) {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    return this;
  }
  /**
   * If this vector's length is greater than the max value, it is replaced by
   * the max value.
   * If this vector's length is less than the min value, it is replaced by the
   * min value.
   *
   * @param {number} min - The minimum value the vector length will be clamped to.
   * @param {number} max - The maximum value the vector length will be clamped to.
   * @return {Vector2} A reference to this vector.
   */
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }
  /**
   * The components of this vector are rounded down to the nearest integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded up to the nearest integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded to the nearest integer value
   *
   * @return {Vector2} A reference to this vector.
   */
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    return this;
  }
  /**
   * The components of this vector are rounded towards zero (up if negative,
   * down if positive) to an integer value.
   *
   * @return {Vector2} A reference to this vector.
   */
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    return this;
  }
  /**
   * Inverts this vector - i.e. sets x = -x and y = -y.
   *
   * @return {Vector2} A reference to this vector.
   */
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }
  /**
   * Calculates the dot product of the given vector with this instance.
   *
   * @param {Vector2} v - The vector to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y;
  }
  /**
   * Calculates the cross product of the given vector with this instance.
   *
   * @param {Vector2} v - The vector to compute the cross product with.
   * @return {number} The result of the cross product.
   */
  cross(v) {
    return this.x * v.y - this.y * v.x;
  }
  /**
   * Computes the square of the Euclidean length (straight-line length) from
   * (0, 0) to (x, y). If you are comparing the lengths of vectors, you should
   * compare the length squared instead as it is slightly more efficient to calculate.
   *
   * @return {number} The square length of this vector.
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }
  /**
   * Computes the  Euclidean length (straight-line length) from (0, 0) to (x, y).
   *
   * @return {number} The length of this vector.
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /**
   * Computes the Manhattan length of this vector.
   *
   * @return {number} The length of this vector.
   */
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y);
  }
  /**
   * Converts this vector to a unit vector - that is, sets it equal to a vector
   * with the same direction as this one, but with a vector length of `1`.
   *
   * @return {Vector2} A reference to this vector.
   */
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  /**
   * Computes the angle in radians of this vector with respect to the positive x-axis.
   *
   * @return {number} The angle in radians.
   */
  angle() {
    const angle = Math.atan2(-this.y, -this.x) + Math.PI;
    return angle;
  }
  /**
   * Returns the angle between the given vector and this instance in radians.
   *
   * @param {Vector2} v - The vector to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  /**
   * Computes the distance from the given vector to this instance.
   *
   * @param {Vector2} v - The vector to compute the distance to.
   * @return {number} The distance.
   */
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  /**
   * Computes the squared distance from the given vector to this instance.
   * If you are just comparing the distance with another distance, you should compare
   * the distance squared instead as it is slightly more efficient to calculate.
   *
   * @param {Vector2} v - The vector to compute the squared distance to.
   * @return {number} The squared distance.
   */
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y;
    return dx * dx + dy * dy;
  }
  /**
   * Computes the Manhattan distance from the given vector to this instance.
   *
   * @param {Vector2} v - The vector to compute the Manhattan distance to.
   * @return {number} The Manhattan distance.
   */
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
  }
  /**
   * Sets this vector to a vector with the same direction as this one, but
   * with the specified length.
   *
   * @param {number} length - The new length of this vector.
   * @return {Vector2} A reference to this vector.
   */
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  /**
   * Linearly interpolates between the given vector and this instance, where
   * alpha is the percent distance along the line - alpha = 0 will be this
   * vector, and alpha = 1 will be the given one.
   *
   * @param {Vector2} v - The vector to interpolate towards.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector2} A reference to this vector.
   */
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given vectors, where alpha is the percent
   * distance along the line - alpha = 0 will be first vector, and alpha = 1 will
   * be the second one. The result is stored in this instance.
   *
   * @param {Vector2} v1 - The first vector.
   * @param {Vector2} v2 - The second vector.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector2} A reference to this vector.
   */
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    return this;
  }
  /**
   * Returns `true` if this vector is equal with the given one.
   *
   * @param {Vector2} v - The vector to test for equality.
   * @return {boolean} Whether this vector is equal with the given one.
   */
  equals(v) {
    return v.x === this.x && v.y === this.y;
  }
  /**
   * Sets this vector's x value to be `array[ offset ]` and y
   * value to be `array[ offset + 1 ]`.
   *
   * @param {Array<number>} array - An array holding the vector component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Vector2} A reference to this vector.
   */
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    return this;
  }
  /**
   * Writes the components of this vector to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the vector components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The vector components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    return array;
  }
  /**
   * Sets the components of this vector from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding vector data.
   * @param {number} index - The index into the attribute.
   * @return {Vector2} A reference to this vector.
   */
  fromBufferAttribute(attribute, index2) {
    this.x = attribute.getX(index2);
    this.y = attribute.getY(index2);
    return this;
  }
  /**
   * Rotates this vector around the given center by the given angle.
   *
   * @param {Vector2} center - The point around which to rotate.
   * @param {number} angle - The angle to rotate, in radians.
   * @return {Vector2} A reference to this vector.
   */
  rotateAround(center, angle) {
    const c2 = Math.cos(angle), s2 = Math.sin(angle);
    const x = this.x - center.x;
    const y = this.y - center.y;
    this.x = x * c2 - y * s2 + center.x;
    this.y = x * s2 + y * c2 + center.y;
    return this;
  }
  /**
   * Sets each component of this vector to a pseudo-random value between `0` and
   * `1`, excluding `1`.
   *
   * @return {Vector2} A reference to this vector.
   */
  random() {
    this.x = Math.random();
    this.y = Math.random();
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
  }
}
class Quaternion {
  /**
   * Constructs a new quaternion.
   *
   * @param {number} [x=0] - The x value of this quaternion.
   * @param {number} [y=0] - The y value of this quaternion.
   * @param {number} [z=0] - The z value of this quaternion.
   * @param {number} [w=1] - The w value of this quaternion.
   */
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.isQuaternion = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }
  /**
   * Interpolates between two quaternions via SLERP. This implementation assumes the
   * quaternion data are managed in flat arrays.
   *
   * @param {Array<number>} dst - The destination array.
   * @param {number} dstOffset - An offset into the destination array.
   * @param {Array<number>} src0 - The source array of the first quaternion.
   * @param {number} srcOffset0 - An offset into the first source array.
   * @param {Array<number>} src1 -  The source array of the second quaternion.
   * @param {number} srcOffset1 - An offset into the second source array.
   * @param {number} t - The interpolation factor in the range `[0,1]`.
   * @see {@link Quaternion#slerp}
   */
  static slerpFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1, t2) {
    let x0 = src0[srcOffset0 + 0], y0 = src0[srcOffset0 + 1], z0 = src0[srcOffset0 + 2], w0 = src0[srcOffset0 + 3];
    let x1 = src1[srcOffset1 + 0], y1 = src1[srcOffset1 + 1], z1 = src1[srcOffset1 + 2], w1 = src1[srcOffset1 + 3];
    if (t2 <= 0) {
      dst[dstOffset + 0] = x0;
      dst[dstOffset + 1] = y0;
      dst[dstOffset + 2] = z0;
      dst[dstOffset + 3] = w0;
      return;
    }
    if (t2 >= 1) {
      dst[dstOffset + 0] = x1;
      dst[dstOffset + 1] = y1;
      dst[dstOffset + 2] = z1;
      dst[dstOffset + 3] = w1;
      return;
    }
    if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
      let dot = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
      if (dot < 0) {
        x1 = -x1;
        y1 = -y1;
        z1 = -z1;
        w1 = -w1;
        dot = -dot;
      }
      let s2 = 1 - t2;
      if (dot < 0.9995) {
        const theta = Math.acos(dot);
        const sin = Math.sin(theta);
        s2 = Math.sin(s2 * theta) / sin;
        t2 = Math.sin(t2 * theta) / sin;
        x0 = x0 * s2 + x1 * t2;
        y0 = y0 * s2 + y1 * t2;
        z0 = z0 * s2 + z1 * t2;
        w0 = w0 * s2 + w1 * t2;
      } else {
        x0 = x0 * s2 + x1 * t2;
        y0 = y0 * s2 + y1 * t2;
        z0 = z0 * s2 + z1 * t2;
        w0 = w0 * s2 + w1 * t2;
        const f2 = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
        x0 *= f2;
        y0 *= f2;
        z0 *= f2;
        w0 *= f2;
      }
    }
    dst[dstOffset] = x0;
    dst[dstOffset + 1] = y0;
    dst[dstOffset + 2] = z0;
    dst[dstOffset + 3] = w0;
  }
  /**
   * Multiplies two quaternions. This implementation assumes the quaternion data are managed
   * in flat arrays.
   *
   * @param {Array<number>} dst - The destination array.
   * @param {number} dstOffset - An offset into the destination array.
   * @param {Array<number>} src0 - The source array of the first quaternion.
   * @param {number} srcOffset0 - An offset into the first source array.
   * @param {Array<number>} src1 -  The source array of the second quaternion.
   * @param {number} srcOffset1 - An offset into the second source array.
   * @return {Array<number>} The destination array.
   * @see {@link Quaternion#multiplyQuaternions}.
   */
  static multiplyQuaternionsFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1) {
    const x0 = src0[srcOffset0];
    const y0 = src0[srcOffset0 + 1];
    const z0 = src0[srcOffset0 + 2];
    const w0 = src0[srcOffset0 + 3];
    const x1 = src1[srcOffset1];
    const y1 = src1[srcOffset1 + 1];
    const z1 = src1[srcOffset1 + 2];
    const w1 = src1[srcOffset1 + 3];
    dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
    dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
    dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
    dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
    return dst;
  }
  /**
   * The x value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  /**
   * The y value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  /**
   * The z value of this quaternion.
   *
   * @type {number}
   * @default 0
   */
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  /**
   * The w value of this quaternion.
   *
   * @type {number}
   * @default 1
   */
  get w() {
    return this._w;
  }
  set w(value) {
    this._w = value;
    this._onChangeCallback();
  }
  /**
   * Sets the quaternion components.
   *
   * @param {number} x - The x value of this quaternion.
   * @param {number} y - The y value of this quaternion.
   * @param {number} z - The z value of this quaternion.
   * @param {number} w - The w value of this quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  set(x, y, z, w) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this._onChangeCallback();
    return this;
  }
  /**
   * Returns a new quaternion with copied values from this instance.
   *
   * @return {Quaternion} A clone of this instance.
   */
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._w);
  }
  /**
   * Copies the values of the given quaternion to this instance.
   *
   * @param {Quaternion} quaternion - The quaternion to copy.
   * @return {Quaternion} A reference to this quaternion.
   */
  copy(quaternion) {
    this._x = quaternion.x;
    this._y = quaternion.y;
    this._z = quaternion.z;
    this._w = quaternion.w;
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the rotation specified by the given
   * Euler angles.
   *
   * @param {Euler} euler - The Euler angles.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromEuler(euler, update = true) {
    const x = euler._x, y = euler._y, z = euler._z, order = euler._order;
    const cos = Math.cos;
    const sin = Math.sin;
    const c1 = cos(x / 2);
    const c2 = cos(y / 2);
    const c3 = cos(z / 2);
    const s1 = sin(x / 2);
    const s2 = sin(y / 2);
    const s3 = sin(z / 2);
    switch (order) {
      case "XYZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "YXZ":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "ZXY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "ZYX":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case "YZX":
        this._x = s1 * c2 * c3 + c1 * s2 * s3;
        this._y = c1 * s2 * c3 + s1 * c2 * s3;
        this._z = c1 * c2 * s3 - s1 * s2 * c3;
        this._w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "XZY":
        this._x = s1 * c2 * c3 - c1 * s2 * s3;
        this._y = c1 * s2 * c3 - s1 * c2 * s3;
        this._z = c1 * c2 * s3 + s1 * s2 * c3;
        this._w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      default:
        warn("Quaternion: .setFromEuler() encountered an unknown order: " + order);
    }
    if (update === true) this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the given axis and angle.
   *
   * @param {Vector3} axis - The normalized axis.
   * @param {number} angle - The angle in radians.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2, s2 = Math.sin(halfAngle);
    this._x = axis.x * s2;
    this._y = axis.y * s2;
    this._z = axis.z * s2;
    this._w = Math.cos(halfAngle);
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion from the given rotation matrix.
   *
   * @param {Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromRotationMatrix(m) {
    const te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10], trace = m11 + m22 + m33;
    if (trace > 0) {
      const s2 = 0.5 / Math.sqrt(trace + 1);
      this._w = 0.25 / s2;
      this._x = (m32 - m23) * s2;
      this._y = (m13 - m31) * s2;
      this._z = (m21 - m12) * s2;
    } else if (m11 > m22 && m11 > m33) {
      const s2 = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this._w = (m32 - m23) / s2;
      this._x = 0.25 * s2;
      this._y = (m12 + m21) / s2;
      this._z = (m13 + m31) / s2;
    } else if (m22 > m33) {
      const s2 = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this._w = (m13 - m31) / s2;
      this._x = (m12 + m21) / s2;
      this._y = 0.25 * s2;
      this._z = (m23 + m32) / s2;
    } else {
      const s2 = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this._w = (m21 - m12) / s2;
      this._x = (m13 + m31) / s2;
      this._y = (m23 + m32) / s2;
      this._z = 0.25 * s2;
    }
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets this quaternion to the rotation required to rotate the direction vector
   * `vFrom` to the direction vector `vTo`.
   *
   * @param {Vector3} vFrom - The first (normalized) direction vector.
   * @param {Vector3} vTo - The second (normalized) direction vector.
   * @return {Quaternion} A reference to this quaternion.
   */
  setFromUnitVectors(vFrom, vTo) {
    let r2 = vFrom.dot(vTo) + 1;
    if (r2 < 1e-8) {
      r2 = 0;
      if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
        this._x = -vFrom.y;
        this._y = vFrom.x;
        this._z = 0;
        this._w = r2;
      } else {
        this._x = 0;
        this._y = -vFrom.z;
        this._z = vFrom.y;
        this._w = r2;
      }
    } else {
      this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
      this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
      this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
      this._w = r2;
    }
    return this.normalize();
  }
  /**
   * Returns the angle between this quaternion and the given one in radians.
   *
   * @param {Quaternion} q - The quaternion to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(q) {
    return 2 * Math.acos(Math.abs(clamp(this.dot(q), -1, 1)));
  }
  /**
   * Rotates this quaternion by a given angular step to the given quaternion.
   * The method ensures that the final quaternion will not overshoot `q`.
   *
   * @param {Quaternion} q - The target quaternion.
   * @param {number} step - The angular step in radians.
   * @return {Quaternion} A reference to this quaternion.
   */
  rotateTowards(q, step) {
    const angle = this.angleTo(q);
    if (angle === 0) return this;
    const t2 = Math.min(1, step / angle);
    this.slerp(q, t2);
    return this;
  }
  /**
   * Sets this quaternion to the identity quaternion; that is, to the
   * quaternion that represents "no rotation".
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  identity() {
    return this.set(0, 0, 0, 1);
  }
  /**
   * Inverts this quaternion via {@link Quaternion#conjugate}. The
   * quaternion is assumed to have unit length.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  invert() {
    return this.conjugate();
  }
  /**
   * Returns the rotational conjugate of this quaternion. The conjugate of a
   * quaternion represents the same rotation in the opposite direction about
   * the rotational axis.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  conjugate() {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this._onChangeCallback();
    return this;
  }
  /**
   * Calculates the dot product of this quaternion and the given one.
   *
   * @param {Quaternion} v - The quaternion to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
  }
  /**
   * Computes the squared Euclidean length (straight-line length) of this quaternion,
   * considered as a 4 dimensional vector. This can be useful if you are comparing the
   * lengths of two quaternions, as this is a slightly more efficient calculation than
   * {@link Quaternion#length}.
   *
   * @return {number} The squared Euclidean length.
   */
  lengthSq() {
    return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
  }
  /**
   * Computes the Euclidean length (straight-line length) of this quaternion,
   * considered as a 4 dimensional vector.
   *
   * @return {number} The Euclidean length.
   */
  length() {
    return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
  }
  /**
   * Normalizes this quaternion - that is, calculated the quaternion that performs
   * the same rotation as this one, but has a length equal to `1`.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  normalize() {
    let l2 = this.length();
    if (l2 === 0) {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._w = 1;
    } else {
      l2 = 1 / l2;
      this._x = this._x * l2;
      this._y = this._y * l2;
      this._z = this._z * l2;
      this._w = this._w * l2;
    }
    this._onChangeCallback();
    return this;
  }
  /**
   * Multiplies this quaternion by the given one.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  multiply(q) {
    return this.multiplyQuaternions(this, q);
  }
  /**
   * Pre-multiplies this quaternion by the given one.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  premultiply(q) {
    return this.multiplyQuaternions(q, this);
  }
  /**
   * Multiplies the given quaternions and stores the result in this instance.
   *
   * @param {Quaternion} a - The first quaternion.
   * @param {Quaternion} b - The second quaternion.
   * @return {Quaternion} A reference to this quaternion.
   */
  multiplyQuaternions(a2, b2) {
    const qax = a2._x, qay = a2._y, qaz = a2._z, qaw = a2._w;
    const qbx = b2._x, qby = b2._y, qbz = b2._z, qbw = b2._w;
    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    this._onChangeCallback();
    return this;
  }
  /**
   * Performs a spherical linear interpolation between quaternions.
   *
   * @param {Quaternion} qb - The target quaternion.
   * @param {number} t - The interpolation factor in the closed interval `[0, 1]`.
   * @return {Quaternion} A reference to this quaternion.
   */
  slerp(qb, t2) {
    if (t2 <= 0) return this;
    if (t2 >= 1) return this.copy(qb);
    let x = qb._x, y = qb._y, z = qb._z, w = qb._w;
    let dot = this.dot(qb);
    if (dot < 0) {
      x = -x;
      y = -y;
      z = -z;
      w = -w;
      dot = -dot;
    }
    let s2 = 1 - t2;
    if (dot < 0.9995) {
      const theta = Math.acos(dot);
      const sin = Math.sin(theta);
      s2 = Math.sin(s2 * theta) / sin;
      t2 = Math.sin(t2 * theta) / sin;
      this._x = this._x * s2 + x * t2;
      this._y = this._y * s2 + y * t2;
      this._z = this._z * s2 + z * t2;
      this._w = this._w * s2 + w * t2;
      this._onChangeCallback();
    } else {
      this._x = this._x * s2 + x * t2;
      this._y = this._y * s2 + y * t2;
      this._z = this._z * s2 + z * t2;
      this._w = this._w * s2 + w * t2;
      this.normalize();
    }
    return this;
  }
  /**
   * Performs a spherical linear interpolation between the given quaternions
   * and stores the result in this quaternion.
   *
   * @param {Quaternion} qa - The source quaternion.
   * @param {Quaternion} qb - The target quaternion.
   * @param {number} t - The interpolation factor in the closed interval `[0, 1]`.
   * @return {Quaternion} A reference to this quaternion.
   */
  slerpQuaternions(qa, qb, t2) {
    return this.copy(qa).slerp(qb, t2);
  }
  /**
   * Sets this quaternion to a uniformly random, normalized quaternion.
   *
   * @return {Quaternion} A reference to this quaternion.
   */
  random() {
    const theta1 = 2 * Math.PI * Math.random();
    const theta2 = 2 * Math.PI * Math.random();
    const x0 = Math.random();
    const r1 = Math.sqrt(1 - x0);
    const r2 = Math.sqrt(x0);
    return this.set(
      r1 * Math.sin(theta1),
      r1 * Math.cos(theta1),
      r2 * Math.sin(theta2),
      r2 * Math.cos(theta2)
    );
  }
  /**
   * Returns `true` if this quaternion is equal with the given one.
   *
   * @param {Quaternion} quaternion - The quaternion to test for equality.
   * @return {boolean} Whether this quaternion is equal with the given one.
   */
  equals(quaternion) {
    return quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w;
  }
  /**
   * Sets this quaternion's components from the given array.
   *
   * @param {Array<number>} array - An array holding the quaternion component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Quaternion} A reference to this quaternion.
   */
  fromArray(array, offset = 0) {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
    this._onChangeCallback();
    return this;
  }
  /**
   * Writes the components of this quaternion to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the quaternion components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The quaternion components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;
    return array;
  }
  /**
   * Sets the components of this quaternion from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding quaternion data.
   * @param {number} index - The index into the attribute.
   * @return {Quaternion} A reference to this quaternion.
   */
  fromBufferAttribute(attribute, index2) {
    this._x = attribute.getX(index2);
    this._y = attribute.getY(index2);
    this._z = attribute.getZ(index2);
    this._w = attribute.getW(index2);
    this._onChangeCallback();
    return this;
  }
  /**
   * This methods defines the serialization result of this class. Returns the
   * numerical elements of this quaternion in an array of format `[x, y, z, w]`.
   *
   * @return {Array<number>} The serialized quaternion.
   */
  toJSON() {
    return this.toArray();
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._w;
  }
}
class Vector3 {
  /**
   * Constructs a new 3D vector.
   *
   * @param {number} [x=0] - The x value of this vector.
   * @param {number} [y=0] - The y value of this vector.
   * @param {number} [z=0] - The z value of this vector.
   */
  constructor(x = 0, y = 0, z = 0) {
    Vector3.prototype.isVector3 = true;
    this.x = x;
    this.y = y;
    this.z = z;
  }
  /**
   * Sets the vector components.
   *
   * @param {number} x - The value of the x component.
   * @param {number} y - The value of the y component.
   * @param {number} z - The value of the z component.
   * @return {Vector3} A reference to this vector.
   */
  set(x, y, z) {
    if (z === void 0) z = this.z;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  /**
   * Sets the vector components to the same value.
   *
   * @param {number} scalar - The value to set for all vector components.
   * @return {Vector3} A reference to this vector.
   */
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }
  /**
   * Sets the vector's x component to the given value
   *
   * @param {number} x - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setX(x) {
    this.x = x;
    return this;
  }
  /**
   * Sets the vector's y component to the given value
   *
   * @param {number} y - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setY(y) {
    this.y = y;
    return this;
  }
  /**
   * Sets the vector's z component to the given value
   *
   * @param {number} z - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setZ(z) {
    this.z = z;
    return this;
  }
  /**
   * Allows to set a vector component with an index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y, `2` equals to z.
   * @param {number} value - The value to set.
   * @return {Vector3} A reference to this vector.
   */
  setComponent(index2, value) {
    switch (index2) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      default:
        throw new Error("index is out of range: " + index2);
    }
    return this;
  }
  /**
   * Returns the value of the vector component which matches the given index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y, `2` equals to z.
   * @return {number} A vector component value.
   */
  getComponent(index2) {
    switch (index2) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      default:
        throw new Error("index is out of range: " + index2);
    }
  }
  /**
   * Returns a new vector with copied values from this instance.
   *
   * @return {Vector3} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.x, this.y, this.z);
  }
  /**
   * Copies the values of the given vector to this instance.
   *
   * @param {Vector3} v - The vector to copy.
   * @return {Vector3} A reference to this vector.
   */
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  /**
   * Adds the given vector to this instance.
   *
   * @param {Vector3} v - The vector to add.
   * @return {Vector3} A reference to this vector.
   */
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  /**
   * Adds the given scalar value to all components of this instance.
   *
   * @param {number} s - The scalar to add.
   * @return {Vector3} A reference to this vector.
   */
  addScalar(s2) {
    this.x += s2;
    this.y += s2;
    this.z += s2;
    return this;
  }
  /**
   * Adds the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  addVectors(a2, b2) {
    this.x = a2.x + b2.x;
    this.y = a2.y + b2.y;
    this.z = a2.z + b2.z;
    return this;
  }
  /**
   * Adds the given vector scaled by the given factor to this instance.
   *
   * @param {Vector3|Vector4} v - The vector.
   * @param {number} s - The factor that scales `v`.
   * @return {Vector3} A reference to this vector.
   */
  addScaledVector(v, s2) {
    this.x += v.x * s2;
    this.y += v.y * s2;
    this.z += v.z * s2;
    return this;
  }
  /**
   * Subtracts the given vector from this instance.
   *
   * @param {Vector3} v - The vector to subtract.
   * @return {Vector3} A reference to this vector.
   */
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  /**
   * Subtracts the given scalar value from all components of this instance.
   *
   * @param {number} s - The scalar to subtract.
   * @return {Vector3} A reference to this vector.
   */
  subScalar(s2) {
    this.x -= s2;
    this.y -= s2;
    this.z -= s2;
    return this;
  }
  /**
   * Subtracts the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  subVectors(a2, b2) {
    this.x = a2.x - b2.x;
    this.y = a2.y - b2.y;
    this.z = a2.z - b2.z;
    return this;
  }
  /**
   * Multiplies the given vector with this instance.
   *
   * @param {Vector3} v - The vector to multiply.
   * @return {Vector3} A reference to this vector.
   */
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }
  /**
   * Multiplies the given scalar value with all components of this instance.
   *
   * @param {number} scalar - The scalar to multiply.
   * @return {Vector3} A reference to this vector.
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }
  /**
   * Multiplies the given vectors and stores the result in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  multiplyVectors(a2, b2) {
    this.x = a2.x * b2.x;
    this.y = a2.y * b2.y;
    this.z = a2.z * b2.z;
    return this;
  }
  /**
   * Applies the given Euler rotation to this vector.
   *
   * @param {Euler} euler - The Euler angles.
   * @return {Vector3} A reference to this vector.
   */
  applyEuler(euler) {
    return this.applyQuaternion(_quaternion$4.setFromEuler(euler));
  }
  /**
   * Applies a rotation specified by an axis and an angle to this vector.
   *
   * @param {Vector3} axis - A normalized vector representing the rotation axis.
   * @param {number} angle - The angle in radians.
   * @return {Vector3} A reference to this vector.
   */
  applyAxisAngle(axis, angle) {
    return this.applyQuaternion(_quaternion$4.setFromAxisAngle(axis, angle));
  }
  /**
   * Multiplies this vector with the given 3x3 matrix.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @return {Vector3} A reference to this vector.
   */
  applyMatrix3(m) {
    const x = this.x, y = this.y, z = this.z;
    const e2 = m.elements;
    this.x = e2[0] * x + e2[3] * y + e2[6] * z;
    this.y = e2[1] * x + e2[4] * y + e2[7] * z;
    this.z = e2[2] * x + e2[5] * y + e2[8] * z;
    return this;
  }
  /**
   * Multiplies this vector by the given normal matrix and normalizes
   * the result.
   *
   * @param {Matrix3} m - The normal matrix.
   * @return {Vector3} A reference to this vector.
   */
  applyNormalMatrix(m) {
    return this.applyMatrix3(m).normalize();
  }
  /**
   * Multiplies this vector (with an implicit 1 in the 4th dimension) by m, and
   * divides by perspective.
   *
   * @param {Matrix4} m - The matrix to apply.
   * @return {Vector3} A reference to this vector.
   */
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z;
    const e2 = m.elements;
    const w = 1 / (e2[3] * x + e2[7] * y + e2[11] * z + e2[15]);
    this.x = (e2[0] * x + e2[4] * y + e2[8] * z + e2[12]) * w;
    this.y = (e2[1] * x + e2[5] * y + e2[9] * z + e2[13]) * w;
    this.z = (e2[2] * x + e2[6] * y + e2[10] * z + e2[14]) * w;
    return this;
  }
  /**
   * Applies the given Quaternion to this vector.
   *
   * @param {Quaternion} q - The Quaternion.
   * @return {Vector3} A reference to this vector.
   */
  applyQuaternion(q) {
    const vx = this.x, vy = this.y, vz = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    this.x = vx + qw * tx + qy * tz - qz * ty;
    this.y = vy + qw * ty + qz * tx - qx * tz;
    this.z = vz + qw * tz + qx * ty - qy * tx;
    return this;
  }
  /**
   * Projects this vector from world space into the camera's normalized
   * device coordinate (NDC) space.
   *
   * @param {Camera} camera - The camera.
   * @return {Vector3} A reference to this vector.
   */
  project(camera) {
    return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  }
  /**
   * Unprojects this vector from the camera's normalized device coordinate (NDC)
   * space into world space.
   *
   * @param {Camera} camera - The camera.
   * @return {Vector3} A reference to this vector.
   */
  unproject(camera) {
    return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  }
  /**
   * Transforms the direction of this vector by a matrix (the upper left 3 x 3
   * subset of the given 4x4 matrix and then normalizes the result.
   *
   * @param {Matrix4} m - The matrix.
   * @return {Vector3} A reference to this vector.
   */
  transformDirection(m) {
    const x = this.x, y = this.y, z = this.z;
    const e2 = m.elements;
    this.x = e2[0] * x + e2[4] * y + e2[8] * z;
    this.y = e2[1] * x + e2[5] * y + e2[9] * z;
    this.z = e2[2] * x + e2[6] * y + e2[10] * z;
    return this.normalize();
  }
  /**
   * Divides this instance by the given vector.
   *
   * @param {Vector3} v - The vector to divide.
   * @return {Vector3} A reference to this vector.
   */
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    return this;
  }
  /**
   * Divides this vector by the given scalar.
   *
   * @param {number} scalar - The scalar to divide.
   * @return {Vector3} A reference to this vector.
   */
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  /**
   * If this vector's x, y or z value is greater than the given vector's x, y or z
   * value, replace that value with the corresponding min value.
   *
   * @param {Vector3} v - The vector.
   * @return {Vector3} A reference to this vector.
   */
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }
  /**
   * If this vector's x, y or z value is less than the given vector's x, y or z
   * value, replace that value with the corresponding max value.
   *
   * @param {Vector3} v - The vector.
   * @return {Vector3} A reference to this vector.
   */
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }
  /**
   * If this vector's x, y or z value is greater than the max vector's x, y or z
   * value, it is replaced by the corresponding value.
   * If this vector's x, y or z value is less than the min vector's x, y or z value,
   * it is replaced by the corresponding value.
   *
   * @param {Vector3} min - The minimum x, y and z values.
   * @param {Vector3} max - The maximum x, y and z values in the desired range.
   * @return {Vector3} A reference to this vector.
   */
  clamp(min, max) {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    this.z = clamp(this.z, min.z, max.z);
    return this;
  }
  /**
   * If this vector's x, y or z values are greater than the max value, they are
   * replaced by the max value.
   * If this vector's x, y or z values are less than the min value, they are
   * replaced by the min value.
   *
   * @param {number} minVal - The minimum value the components will be clamped to.
   * @param {number} maxVal - The maximum value the components will be clamped to.
   * @return {Vector3} A reference to this vector.
   */
  clampScalar(minVal, maxVal) {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    this.z = clamp(this.z, minVal, maxVal);
    return this;
  }
  /**
   * If this vector's length is greater than the max value, it is replaced by
   * the max value.
   * If this vector's length is less than the min value, it is replaced by the
   * min value.
   *
   * @param {number} min - The minimum value the vector length will be clamped to.
   * @param {number} max - The maximum value the vector length will be clamped to.
   * @return {Vector3} A reference to this vector.
   */
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }
  /**
   * The components of this vector are rounded down to the nearest integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded up to the nearest integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded to the nearest integer value
   *
   * @return {Vector3} A reference to this vector.
   */
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }
  /**
   * The components of this vector are rounded towards zero (up if negative,
   * down if positive) to an integer value.
   *
   * @return {Vector3} A reference to this vector.
   */
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.z = Math.trunc(this.z);
    return this;
  }
  /**
   * Inverts this vector - i.e. sets x = -x, y = -y and z = -z.
   *
   * @return {Vector3} A reference to this vector.
   */
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }
  /**
   * Calculates the dot product of the given vector with this instance.
   *
   * @param {Vector3} v - The vector to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  // TODO lengthSquared?
  /**
   * Computes the square of the Euclidean length (straight-line length) from
   * (0, 0, 0) to (x, y, z). If you are comparing the lengths of vectors, you should
   * compare the length squared instead as it is slightly more efficient to calculate.
   *
   * @return {number} The square length of this vector.
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  /**
   * Computes the  Euclidean length (straight-line length) from (0, 0, 0) to (x, y, z).
   *
   * @return {number} The length of this vector.
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  /**
   * Computes the Manhattan length of this vector.
   *
   * @return {number} The length of this vector.
   */
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
  }
  /**
   * Converts this vector to a unit vector - that is, sets it equal to a vector
   * with the same direction as this one, but with a vector length of `1`.
   *
   * @return {Vector3} A reference to this vector.
   */
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  /**
   * Sets this vector to a vector with the same direction as this one, but
   * with the specified length.
   *
   * @param {number} length - The new length of this vector.
   * @return {Vector3} A reference to this vector.
   */
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  /**
   * Linearly interpolates between the given vector and this instance, where
   * alpha is the percent distance along the line - alpha = 0 will be this
   * vector, and alpha = 1 will be the given one.
   *
   * @param {Vector3} v - The vector to interpolate towards.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector3} A reference to this vector.
   */
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given vectors, where alpha is the percent
   * distance along the line - alpha = 0 will be first vector, and alpha = 1 will
   * be the second one. The result is stored in this instance.
   *
   * @param {Vector3} v1 - The first vector.
   * @param {Vector3} v2 - The second vector.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector3} A reference to this vector.
   */
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    return this;
  }
  /**
   * Calculates the cross product of the given vector with this instance.
   *
   * @param {Vector3} v - The vector to compute the cross product with.
   * @return {Vector3} The result of the cross product.
   */
  cross(v) {
    return this.crossVectors(this, v);
  }
  /**
   * Calculates the cross product of the given vectors and stores the result
   * in this instance.
   *
   * @param {Vector3} a - The first vector.
   * @param {Vector3} b - The second vector.
   * @return {Vector3} A reference to this vector.
   */
  crossVectors(a2, b2) {
    const ax = a2.x, ay = a2.y, az = a2.z;
    const bx = b2.x, by = b2.y, bz = b2.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }
  /**
   * Projects this vector onto the given one.
   *
   * @param {Vector3} v - The vector to project to.
   * @return {Vector3} A reference to this vector.
   */
  projectOnVector(v) {
    const denominator = v.lengthSq();
    if (denominator === 0) return this.set(0, 0, 0);
    const scalar = v.dot(this) / denominator;
    return this.copy(v).multiplyScalar(scalar);
  }
  /**
   * Projects this vector onto a plane by subtracting this
   * vector projected onto the plane's normal from this vector.
   *
   * @param {Vector3} planeNormal - The plane normal.
   * @return {Vector3} A reference to this vector.
   */
  projectOnPlane(planeNormal) {
    _vector$c.copy(this).projectOnVector(planeNormal);
    return this.sub(_vector$c);
  }
  /**
   * Reflects this vector off a plane orthogonal to the given normal vector.
   *
   * @param {Vector3} normal - The (normalized) normal vector.
   * @return {Vector3} A reference to this vector.
   */
  reflect(normal) {
    return this.sub(_vector$c.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }
  /**
   * Returns the angle between the given vector and this instance in radians.
   *
   * @param {Vector3} v - The vector to compute the angle with.
   * @return {number} The angle in radians.
   */
  angleTo(v) {
    const denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
    if (denominator === 0) return Math.PI / 2;
    const theta = this.dot(v) / denominator;
    return Math.acos(clamp(theta, -1, 1));
  }
  /**
   * Computes the distance from the given vector to this instance.
   *
   * @param {Vector3} v - The vector to compute the distance to.
   * @return {number} The distance.
   */
  distanceTo(v) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  /**
   * Computes the squared distance from the given vector to this instance.
   * If you are just comparing the distance with another distance, you should compare
   * the distance squared instead as it is slightly more efficient to calculate.
   *
   * @param {Vector3} v - The vector to compute the squared distance to.
   * @return {number} The squared distance.
   */
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  /**
   * Computes the Manhattan distance from the given vector to this instance.
   *
   * @param {Vector3} v - The vector to compute the Manhattan distance to.
   * @return {number} The Manhattan distance.
   */
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }
  /**
   * Sets the vector components from the given spherical coordinates.
   *
   * @param {Spherical} s - The spherical coordinates.
   * @return {Vector3} A reference to this vector.
   */
  setFromSpherical(s2) {
    return this.setFromSphericalCoords(s2.radius, s2.phi, s2.theta);
  }
  /**
   * Sets the vector components from the given spherical coordinates.
   *
   * @param {number} radius - The radius.
   * @param {number} phi - The phi angle in radians.
   * @param {number} theta - The theta angle in radians.
   * @return {Vector3} A reference to this vector.
   */
  setFromSphericalCoords(radius, phi, theta) {
    const sinPhiRadius = Math.sin(phi) * radius;
    this.x = sinPhiRadius * Math.sin(theta);
    this.y = Math.cos(phi) * radius;
    this.z = sinPhiRadius * Math.cos(theta);
    return this;
  }
  /**
   * Sets the vector components from the given cylindrical coordinates.
   *
   * @param {Cylindrical} c - The cylindrical coordinates.
   * @return {Vector3} A reference to this vector.
   */
  setFromCylindrical(c2) {
    return this.setFromCylindricalCoords(c2.radius, c2.theta, c2.y);
  }
  /**
   * Sets the vector components from the given cylindrical coordinates.
   *
   * @param {number} radius - The radius.
   * @param {number} theta - The theta angle in radians.
   * @param {number} y - The y value.
   * @return {Vector3} A reference to this vector.
   */
  setFromCylindricalCoords(radius, theta, y) {
    this.x = radius * Math.sin(theta);
    this.y = y;
    this.z = radius * Math.cos(theta);
    return this;
  }
  /**
   * Sets the vector components to the position elements of the
   * given transformation matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixPosition(m) {
    const e2 = m.elements;
    this.x = e2[12];
    this.y = e2[13];
    this.z = e2[14];
    return this;
  }
  /**
   * Sets the vector components to the scale elements of the
   * given transformation matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx;
    this.y = sy;
    this.z = sz;
    return this;
  }
  /**
   * Sets the vector components from the specified matrix column.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @param {number} index - The column index.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrixColumn(m, index2) {
    return this.fromArray(m.elements, index2 * 4);
  }
  /**
   * Sets the vector components from the specified matrix column.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @param {number} index - The column index.
   * @return {Vector3} A reference to this vector.
   */
  setFromMatrix3Column(m, index2) {
    return this.fromArray(m.elements, index2 * 3);
  }
  /**
   * Sets the vector components from the given Euler angles.
   *
   * @param {Euler} e - The Euler angles to set.
   * @return {Vector3} A reference to this vector.
   */
  setFromEuler(e2) {
    this.x = e2._x;
    this.y = e2._y;
    this.z = e2._z;
    return this;
  }
  /**
   * Sets the vector components from the RGB components of the
   * given color.
   *
   * @param {Color} c - The color to set.
   * @return {Vector3} A reference to this vector.
   */
  setFromColor(c2) {
    this.x = c2.r;
    this.y = c2.g;
    this.z = c2.b;
    return this;
  }
  /**
   * Returns `true` if this vector is equal with the given one.
   *
   * @param {Vector3} v - The vector to test for equality.
   * @return {boolean} Whether this vector is equal with the given one.
   */
  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z;
  }
  /**
   * Sets this vector's x value to be `array[ offset ]`, y value to be `array[ offset + 1 ]`
   * and z value to be `array[ offset + 2 ]`.
   *
   * @param {Array<number>} array - An array holding the vector component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Vector3} A reference to this vector.
   */
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }
  /**
   * Writes the components of this vector to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the vector components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The vector components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }
  /**
   * Sets the components of this vector from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding vector data.
   * @param {number} index - The index into the attribute.
   * @return {Vector3} A reference to this vector.
   */
  fromBufferAttribute(attribute, index2) {
    this.x = attribute.getX(index2);
    this.y = attribute.getY(index2);
    this.z = attribute.getZ(index2);
    return this;
  }
  /**
   * Sets each component of this vector to a pseudo-random value between `0` and
   * `1`, excluding `1`.
   *
   * @return {Vector3} A reference to this vector.
   */
  random() {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    return this;
  }
  /**
   * Sets this vector to a uniformly random point on a unit sphere.
   *
   * @return {Vector3} A reference to this vector.
   */
  randomDirection() {
    const theta = Math.random() * Math.PI * 2;
    const u2 = Math.random() * 2 - 1;
    const c2 = Math.sqrt(1 - u2 * u2);
    this.x = c2 * Math.cos(theta);
    this.y = u2;
    this.z = c2 * Math.sin(theta);
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
  }
}
const _vector$c = /* @__PURE__ */ new Vector3();
const _quaternion$4 = /* @__PURE__ */ new Quaternion();
class Matrix3 {
  /**
   * Constructs a new 3x3 matrix. The arguments are supposed to be
   * in row-major order. If no arguments are provided, the constructor
   * initializes the matrix as an identity matrix.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   */
  constructor(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    Matrix3.prototype.isMatrix3 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n21, n22, n23, n31, n32, n33);
    }
  }
  /**
   * Sets the elements of the matrix.The arguments are supposed to be
   * in row-major order.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @return {Matrix3} A reference to this matrix.
   */
  set(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    const te = this.elements;
    te[0] = n11;
    te[1] = n21;
    te[2] = n31;
    te[3] = n12;
    te[4] = n22;
    te[5] = n32;
    te[6] = n13;
    te[7] = n23;
    te[8] = n33;
    return this;
  }
  /**
   * Sets this matrix to the 3x3 identity matrix.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Copies the values of the given matrix to this instance.
   *
   * @param {Matrix3} m - The matrix to copy.
   * @return {Matrix3} A reference to this matrix.
   */
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    return this;
  }
  /**
   * Extracts the basis of this matrix into the three axis vectors provided.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix3} A reference to this matrix.
   */
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrix3Column(this, 0);
    yAxis.setFromMatrix3Column(this, 1);
    zAxis.setFromMatrix3Column(this, 2);
    return this;
  }
  /**
   * Set this matrix to the upper 3x3 matrix of the given 4x4 matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  setFromMatrix4(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[4],
      me[8],
      me[1],
      me[5],
      me[9],
      me[2],
      me[6],
      me[10]
    );
    return this;
  }
  /**
   * Post-multiplies this matrix by the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to multiply with.
   * @return {Matrix3} A reference to this matrix.
   */
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  /**
   * Pre-multiplies this matrix by the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix to multiply with.
   * @return {Matrix3} A reference to this matrix.
   */
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  /**
   * Multiples the given 3x3 matrices and stores the result
   * in this matrix.
   *
   * @param {Matrix3} a - The first matrix.
   * @param {Matrix3} b - The second matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  multiplyMatrices(a2, b2) {
    const ae = a2.elements;
    const be = b2.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[3], a13 = ae[6];
    const a21 = ae[1], a22 = ae[4], a23 = ae[7];
    const a31 = ae[2], a32 = ae[5], a33 = ae[8];
    const b11 = be[0], b12 = be[3], b13 = be[6];
    const b21 = be[1], b22 = be[4], b23 = be[7];
    const b31 = be[2], b32 = be[5], b33 = be[8];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31;
    te[3] = a11 * b12 + a12 * b22 + a13 * b32;
    te[6] = a11 * b13 + a12 * b23 + a13 * b33;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31;
    te[4] = a21 * b12 + a22 * b22 + a23 * b32;
    te[7] = a21 * b13 + a22 * b23 + a23 * b33;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31;
    te[5] = a31 * b12 + a32 * b22 + a33 * b32;
    te[8] = a31 * b13 + a32 * b23 + a33 * b33;
    return this;
  }
  /**
   * Multiplies every component of the matrix by the given scalar.
   *
   * @param {number} s - The scalar.
   * @return {Matrix3} A reference to this matrix.
   */
  multiplyScalar(s2) {
    const te = this.elements;
    te[0] *= s2;
    te[3] *= s2;
    te[6] *= s2;
    te[1] *= s2;
    te[4] *= s2;
    te[7] *= s2;
    te[2] *= s2;
    te[5] *= s2;
    te[8] *= s2;
    return this;
  }
  /**
   * Computes and returns the determinant of this matrix.
   *
   * @return {number} The determinant.
   */
  determinant() {
    const te = this.elements;
    const a2 = te[0], b2 = te[1], c2 = te[2], d2 = te[3], e2 = te[4], f2 = te[5], g = te[6], h2 = te[7], i = te[8];
    return a2 * e2 * i - a2 * f2 * h2 - b2 * d2 * i + b2 * f2 * g + c2 * d2 * h2 - c2 * e2 * g;
  }
  /**
   * Inverts this matrix, using the [analytic method](https://en.wikipedia.org/wiki/Invertible_matrix#Analytic_solution).
   * You can not invert with a determinant of zero. If you attempt this, the method produces
   * a zero matrix instead.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n12 = te[3], n22 = te[4], n32 = te[5], n13 = te[6], n23 = te[7], n33 = te[8], t11 = n33 * n22 - n32 * n23, t12 = n32 * n13 - n33 * n12, t13 = n23 * n12 - n22 * n13, det = n11 * t11 + n21 * t12 + n31 * t13;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n31 * n23 - n33 * n21) * detInv;
    te[2] = (n32 * n21 - n31 * n22) * detInv;
    te[3] = t12 * detInv;
    te[4] = (n33 * n11 - n31 * n13) * detInv;
    te[5] = (n31 * n12 - n32 * n11) * detInv;
    te[6] = t13 * detInv;
    te[7] = (n21 * n13 - n23 * n11) * detInv;
    te[8] = (n22 * n11 - n21 * n12) * detInv;
    return this;
  }
  /**
   * Transposes this matrix in place.
   *
   * @return {Matrix3} A reference to this matrix.
   */
  transpose() {
    let tmp;
    const m = this.elements;
    tmp = m[1];
    m[1] = m[3];
    m[3] = tmp;
    tmp = m[2];
    m[2] = m[6];
    m[6] = tmp;
    tmp = m[5];
    m[5] = m[7];
    m[7] = tmp;
    return this;
  }
  /**
   * Computes the normal matrix which is the inverse transpose of the upper
   * left 3x3 portion of the given 4x4 matrix.
   *
   * @param {Matrix4} matrix4 - The 4x4 matrix.
   * @return {Matrix3} A reference to this matrix.
   */
  getNormalMatrix(matrix4) {
    return this.setFromMatrix4(matrix4).invert().transpose();
  }
  /**
   * Transposes this matrix into the supplied array, and returns itself unchanged.
   *
   * @param {Array<number>} r - An array to store the transposed matrix elements.
   * @return {Matrix3} A reference to this matrix.
   */
  transposeIntoArray(r2) {
    const m = this.elements;
    r2[0] = m[0];
    r2[1] = m[3];
    r2[2] = m[6];
    r2[3] = m[1];
    r2[4] = m[4];
    r2[5] = m[7];
    r2[6] = m[2];
    r2[7] = m[5];
    r2[8] = m[8];
    return this;
  }
  /**
   * Sets the UV transform matrix from offset, repeat, rotation, and center.
   *
   * @param {number} tx - Offset x.
   * @param {number} ty - Offset y.
   * @param {number} sx - Repeat x.
   * @param {number} sy - Repeat y.
   * @param {number} rotation - Rotation, in radians. Positive values rotate counterclockwise.
   * @param {number} cx - Center x of rotation.
   * @param {number} cy - Center y of rotation
   * @return {Matrix3} A reference to this matrix.
   */
  setUvTransform(tx, ty, sx, sy, rotation, cx, cy) {
    const c2 = Math.cos(rotation);
    const s2 = Math.sin(rotation);
    this.set(
      sx * c2,
      sx * s2,
      -sx * (c2 * cx + s2 * cy) + cx + tx,
      -sy * s2,
      sy * c2,
      -sy * (-s2 * cx + c2 * cy) + cy + ty,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Scales this matrix with the given scalar values.
   *
   * @param {number} sx - The amount to scale in the X axis.
   * @param {number} sy - The amount to scale in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  scale(sx, sy) {
    this.premultiply(_m3.makeScale(sx, sy));
    return this;
  }
  /**
   * Rotates this matrix by the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix3} A reference to this matrix.
   */
  rotate(theta) {
    this.premultiply(_m3.makeRotation(-theta));
    return this;
  }
  /**
   * Translates this matrix by the given scalar values.
   *
   * @param {number} tx - The amount to translate in the X axis.
   * @param {number} ty - The amount to translate in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  translate(tx, ty) {
    this.premultiply(_m3.makeTranslation(tx, ty));
    return this;
  }
  // for 2D Transforms
  /**
   * Sets this matrix as a 2D translation transform.
   *
   * @param {number|Vector2} x - The amount to translate in the X axis or alternatively a translation vector.
   * @param {number} y - The amount to translate in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  makeTranslation(x, y) {
    if (x.isVector2) {
      this.set(
        1,
        0,
        x.x,
        0,
        1,
        x.y,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        x,
        0,
        1,
        y,
        0,
        0,
        1
      );
    }
    return this;
  }
  /**
   * Sets this matrix as a 2D rotational transformation.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix3} A reference to this matrix.
   */
  makeRotation(theta) {
    const c2 = Math.cos(theta);
    const s2 = Math.sin(theta);
    this.set(
      c2,
      -s2,
      0,
      s2,
      c2,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a 2D scale transform.
   *
   * @param {number} x - The amount to scale in the X axis.
   * @param {number} y - The amount to scale in the Y axis.
   * @return {Matrix3} A reference to this matrix.
   */
  makeScale(x, y) {
    this.set(
      x,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Returns `true` if this matrix is equal with the given one.
   *
   * @param {Matrix3} matrix - The matrix to test for equality.
   * @return {boolean} Whether this matrix is equal with the given one.
   */
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 9; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  /**
   * Sets the elements of the matrix from the given array.
   *
   * @param {Array<number>} array - The matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Matrix3} A reference to this matrix.
   */
  fromArray(array, offset = 0) {
    for (let i = 0; i < 9; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  /**
   * Writes the elements of this matrix to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The matrix elements in column-major order.
   */
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    return array;
  }
  /**
   * Returns a matrix with copied values from this instance.
   *
   * @return {Matrix3} A clone of this instance.
   */
  clone() {
    return new this.constructor().fromArray(this.elements);
  }
}
const _m3 = /* @__PURE__ */ new Matrix3();
const LINEAR_REC709_TO_XYZ = /* @__PURE__ */ new Matrix3().set(
  0.4123908,
  0.3575843,
  0.1804808,
  0.212639,
  0.7151687,
  0.0721923,
  0.0193308,
  0.1191948,
  0.9505322
);
const XYZ_TO_LINEAR_REC709 = /* @__PURE__ */ new Matrix3().set(
  3.2409699,
  -1.5373832,
  -0.4986108,
  -0.9692436,
  1.8759675,
  0.0415551,
  0.0556301,
  -0.203977,
  1.0569715
);
function createColorManagement() {
  const ColorManagement2 = {
    enabled: true,
    workingColorSpace: LinearSRGBColorSpace,
    /**
     * Implementations of supported color spaces.
     *
     * Required:
     *	- primaries: chromaticity coordinates [ rx ry gx gy bx by ]
     *	- whitePoint: reference white [ x y ]
     *	- transfer: transfer function (pre-defined)
     *	- toXYZ: Matrix3 RGB to XYZ transform
     *	- fromXYZ: Matrix3 XYZ to RGB transform
     *	- luminanceCoefficients: RGB luminance coefficients
     *
     * Optional:
     *  - outputColorSpaceConfig: { drawingBufferColorSpace: ColorSpace, toneMappingMode: 'extended' | 'standard' }
     *  - workingColorSpaceConfig: { unpackColorSpace: ColorSpace }
     *
     * Reference:
     * - https://www.russellcottrell.com/photo/matrixCalculator.htm
     */
    spaces: {},
    convert: function(color, sourceColorSpace, targetColorSpace) {
      if (this.enabled === false || sourceColorSpace === targetColorSpace || !sourceColorSpace || !targetColorSpace) {
        return color;
      }
      if (this.spaces[sourceColorSpace].transfer === SRGBTransfer) {
        color.r = SRGBToLinear(color.r);
        color.g = SRGBToLinear(color.g);
        color.b = SRGBToLinear(color.b);
      }
      if (this.spaces[sourceColorSpace].primaries !== this.spaces[targetColorSpace].primaries) {
        color.applyMatrix3(this.spaces[sourceColorSpace].toXYZ);
        color.applyMatrix3(this.spaces[targetColorSpace].fromXYZ);
      }
      if (this.spaces[targetColorSpace].transfer === SRGBTransfer) {
        color.r = LinearToSRGB(color.r);
        color.g = LinearToSRGB(color.g);
        color.b = LinearToSRGB(color.b);
      }
      return color;
    },
    workingToColorSpace: function(color, targetColorSpace) {
      return this.convert(color, this.workingColorSpace, targetColorSpace);
    },
    colorSpaceToWorking: function(color, sourceColorSpace) {
      return this.convert(color, sourceColorSpace, this.workingColorSpace);
    },
    getPrimaries: function(colorSpace) {
      return this.spaces[colorSpace].primaries;
    },
    getTransfer: function(colorSpace) {
      if (colorSpace === NoColorSpace) return LinearTransfer;
      return this.spaces[colorSpace].transfer;
    },
    getToneMappingMode: function(colorSpace) {
      return this.spaces[colorSpace].outputColorSpaceConfig.toneMappingMode || "standard";
    },
    getLuminanceCoefficients: function(target, colorSpace = this.workingColorSpace) {
      return target.fromArray(this.spaces[colorSpace].luminanceCoefficients);
    },
    define: function(colorSpaces) {
      Object.assign(this.spaces, colorSpaces);
    },
    // Internal APIs
    _getMatrix: function(targetMatrix, sourceColorSpace, targetColorSpace) {
      return targetMatrix.copy(this.spaces[sourceColorSpace].toXYZ).multiply(this.spaces[targetColorSpace].fromXYZ);
    },
    _getDrawingBufferColorSpace: function(colorSpace) {
      return this.spaces[colorSpace].outputColorSpaceConfig.drawingBufferColorSpace;
    },
    _getUnpackColorSpace: function(colorSpace = this.workingColorSpace) {
      return this.spaces[colorSpace].workingColorSpaceConfig.unpackColorSpace;
    },
    // Deprecated
    fromWorkingColorSpace: function(color, targetColorSpace) {
      warnOnce("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().");
      return ColorManagement2.workingToColorSpace(color, targetColorSpace);
    },
    toWorkingColorSpace: function(color, sourceColorSpace) {
      warnOnce("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().");
      return ColorManagement2.colorSpaceToWorking(color, sourceColorSpace);
    }
  };
  const REC709_PRIMARIES = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06];
  const REC709_LUMINANCE_COEFFICIENTS = [0.2126, 0.7152, 0.0722];
  const D65 = [0.3127, 0.329];
  ColorManagement2.define({
    [LinearSRGBColorSpace]: {
      primaries: REC709_PRIMARIES,
      whitePoint: D65,
      transfer: LinearTransfer,
      toXYZ: LINEAR_REC709_TO_XYZ,
      fromXYZ: XYZ_TO_LINEAR_REC709,
      luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
      workingColorSpaceConfig: { unpackColorSpace: SRGBColorSpace },
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
    },
    [SRGBColorSpace]: {
      primaries: REC709_PRIMARIES,
      whitePoint: D65,
      transfer: SRGBTransfer,
      toXYZ: LINEAR_REC709_TO_XYZ,
      fromXYZ: XYZ_TO_LINEAR_REC709,
      luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
    }
  });
  return ColorManagement2;
}
const ColorManagement = /* @__PURE__ */ createColorManagement();
function SRGBToLinear(c2) {
  return c2 < 0.04045 ? c2 * 0.0773993808 : Math.pow(c2 * 0.9478672986 + 0.0521327014, 2.4);
}
function LinearToSRGB(c2) {
  return c2 < 31308e-7 ? c2 * 12.92 : 1.055 * Math.pow(c2, 0.41666) - 0.055;
}
let _canvas;
class ImageUtils {
  /**
   * Returns a data URI containing a representation of the given image.
   *
   * @param {(HTMLImageElement|HTMLCanvasElement)} image - The image object.
   * @param {string} [type='image/png'] - Indicates the image format.
   * @return {string} The data URI.
   */
  static getDataURL(image, type = "image/png") {
    if (/^data:/i.test(image.src)) {
      return image.src;
    }
    if (typeof HTMLCanvasElement === "undefined") {
      return image.src;
    }
    let canvas;
    if (image instanceof HTMLCanvasElement) {
      canvas = image;
    } else {
      if (_canvas === void 0) _canvas = createElementNS("canvas");
      _canvas.width = image.width;
      _canvas.height = image.height;
      const context = _canvas.getContext("2d");
      if (image instanceof ImageData) {
        context.putImageData(image, 0, 0);
      } else {
        context.drawImage(image, 0, 0, image.width, image.height);
      }
      canvas = _canvas;
    }
    return canvas.toDataURL(type);
  }
  /**
   * Converts the given sRGB image data to linear color space.
   *
   * @param {(HTMLImageElement|HTMLCanvasElement|ImageBitmap|Object)} image - The image object.
   * @return {HTMLCanvasElement|Object} The converted image.
   */
  static sRGBToLinear(image) {
    if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      const canvas = createElementNS("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, image.width, image.height);
      const imageData = context.getImageData(0, 0, image.width, image.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i++) {
        data[i] = SRGBToLinear(data[i] / 255) * 255;
      }
      context.putImageData(imageData, 0, 0);
      return canvas;
    } else if (image.data) {
      const data = image.data.slice(0);
      for (let i = 0; i < data.length; i++) {
        if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
          data[i] = Math.floor(SRGBToLinear(data[i] / 255) * 255);
        } else {
          data[i] = SRGBToLinear(data[i]);
        }
      }
      return {
        data,
        width: image.width,
        height: image.height
      };
    } else {
      warn("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.");
      return image;
    }
  }
}
let _sourceId = 0;
class Source {
  /**
   * Constructs a new video texture.
   *
   * @param {any} [data=null] - The data definition of a texture.
   */
  constructor(data = null) {
    this.isSource = true;
    Object.defineProperty(this, "id", { value: _sourceId++ });
    this.uuid = generateUUID();
    this.data = data;
    this.dataReady = true;
    this.version = 0;
  }
  /**
   * Returns the dimensions of the source into the given target vector.
   *
   * @param {(Vector2|Vector3)} target - The target object the result is written into.
   * @return {(Vector2|Vector3)} The dimensions of the source.
   */
  getSize(target) {
    const data = this.data;
    if (typeof HTMLVideoElement !== "undefined" && data instanceof HTMLVideoElement) {
      target.set(data.videoWidth, data.videoHeight, 0);
    } else if (data instanceof VideoFrame) {
      target.set(data.displayHeight, data.displayWidth, 0);
    } else if (data !== null) {
      target.set(data.width, data.height, data.depth || 0);
    } else {
      target.set(0, 0, 0);
    }
    return target;
  }
  /**
   * When the property is set to `true`, the engine allocates the memory
   * for the texture (if necessary) and triggers the actual texture upload
   * to the GPU next time the source is used.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
  /**
   * Serializes the source into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized source.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.images[this.uuid] !== void 0) {
      return meta.images[this.uuid];
    }
    const output = {
      uuid: this.uuid,
      url: ""
    };
    const data = this.data;
    if (data !== null) {
      let url;
      if (Array.isArray(data)) {
        url = [];
        for (let i = 0, l2 = data.length; i < l2; i++) {
          if (data[i].isDataTexture) {
            url.push(serializeImage(data[i].image));
          } else {
            url.push(serializeImage(data[i]));
          }
        }
      } else {
        url = serializeImage(data);
      }
      output.url = url;
    }
    if (!isRootObject) {
      meta.images[this.uuid] = output;
    }
    return output;
  }
}
function serializeImage(image) {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement || typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return ImageUtils.getDataURL(image);
  } else {
    if (image.data) {
      return {
        data: Array.from(image.data),
        width: image.width,
        height: image.height,
        type: image.data.constructor.name
      };
    } else {
      warn("Texture: Unable to serialize Texture.");
      return {};
    }
  }
}
let _textureId = 0;
const _tempVec3 = /* @__PURE__ */ new Vector3();
class Texture extends EventDispatcher {
  /**
   * Constructs a new texture.
   *
   * @param {?Object} [image=Texture.DEFAULT_IMAGE] - The image holding the texture data.
   * @param {number} [mapping=Texture.DEFAULT_MAPPING] - The texture mapping.
   * @param {number} [wrapS=ClampToEdgeWrapping] - The wrapS value.
   * @param {number} [wrapT=ClampToEdgeWrapping] - The wrapT value.
   * @param {number} [magFilter=LinearFilter] - The mag filter value.
   * @param {number} [minFilter=LinearMipmapLinearFilter] - The min filter value.
   * @param {number} [format=RGBAFormat] - The texture format.
   * @param {number} [type=UnsignedByteType] - The texture type.
   * @param {number} [anisotropy=Texture.DEFAULT_ANISOTROPY] - The anisotropy value.
   * @param {string} [colorSpace=NoColorSpace] - The color space.
   */
  constructor(image = Texture.DEFAULT_IMAGE, mapping = Texture.DEFAULT_MAPPING, wrapS = ClampToEdgeWrapping, wrapT = ClampToEdgeWrapping, magFilter = LinearFilter, minFilter = LinearMipmapLinearFilter, format = RGBAFormat, type = UnsignedByteType, anisotropy = Texture.DEFAULT_ANISOTROPY, colorSpace = NoColorSpace) {
    super();
    this.isTexture = true;
    Object.defineProperty(this, "id", { value: _textureId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.source = new Source(image);
    this.mipmaps = [];
    this.mapping = mapping;
    this.channel = 0;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    this.magFilter = magFilter;
    this.minFilter = minFilter;
    this.anisotropy = anisotropy;
    this.format = format;
    this.internalFormat = null;
    this.type = type;
    this.offset = new Vector2(0, 0);
    this.repeat = new Vector2(1, 1);
    this.center = new Vector2(0, 0);
    this.rotation = 0;
    this.matrixAutoUpdate = true;
    this.matrix = new Matrix3();
    this.generateMipmaps = true;
    this.premultiplyAlpha = false;
    this.flipY = true;
    this.unpackAlignment = 4;
    this.colorSpace = colorSpace;
    this.userData = {};
    this.updateRanges = [];
    this.version = 0;
    this.onUpdate = null;
    this.renderTarget = null;
    this.isRenderTargetTexture = false;
    this.isArrayTexture = image && image.depth && image.depth > 1 ? true : false;
    this.pmremVersion = 0;
  }
  /**
   * The width of the texture in pixels.
   */
  get width() {
    return this.source.getSize(_tempVec3).x;
  }
  /**
   * The height of the texture in pixels.
   */
  get height() {
    return this.source.getSize(_tempVec3).y;
  }
  /**
   * The depth of the texture in pixels.
   */
  get depth() {
    return this.source.getSize(_tempVec3).z;
  }
  /**
   * The image object holding the texture data.
   *
   * @type {?Object}
   */
  get image() {
    return this.source.data;
  }
  set image(value = null) {
    this.source.data = value;
  }
  /**
   * Updates the texture transformation matrix from the from the properties {@link Texture#offset},
   * {@link Texture#repeat}, {@link Texture#rotation}, and {@link Texture#center}.
   */
  updateMatrix() {
    this.matrix.setUvTransform(this.offset.x, this.offset.y, this.repeat.x, this.repeat.y, this.rotation, this.center.x, this.center.y);
  }
  /**
   * Adds a range of data in the data texture to be updated on the GPU.
   *
   * @param {number} start - Position at which to start update.
   * @param {number} count - The number of components to update.
   */
  addUpdateRange(start, count) {
    this.updateRanges.push({ start, count });
  }
  /**
   * Clears the update ranges.
   */
  clearUpdateRanges() {
    this.updateRanges.length = 0;
  }
  /**
   * Returns a new texture with copied values from this instance.
   *
   * @return {Texture} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given texture to this instance.
   *
   * @param {Texture} source - The texture to copy.
   * @return {Texture} A reference to this instance.
   */
  copy(source) {
    this.name = source.name;
    this.source = source.source;
    this.mipmaps = source.mipmaps.slice(0);
    this.mapping = source.mapping;
    this.channel = source.channel;
    this.wrapS = source.wrapS;
    this.wrapT = source.wrapT;
    this.magFilter = source.magFilter;
    this.minFilter = source.minFilter;
    this.anisotropy = source.anisotropy;
    this.format = source.format;
    this.internalFormat = source.internalFormat;
    this.type = source.type;
    this.offset.copy(source.offset);
    this.repeat.copy(source.repeat);
    this.center.copy(source.center);
    this.rotation = source.rotation;
    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrix.copy(source.matrix);
    this.generateMipmaps = source.generateMipmaps;
    this.premultiplyAlpha = source.premultiplyAlpha;
    this.flipY = source.flipY;
    this.unpackAlignment = source.unpackAlignment;
    this.colorSpace = source.colorSpace;
    this.renderTarget = source.renderTarget;
    this.isRenderTargetTexture = source.isRenderTargetTexture;
    this.isArrayTexture = source.isArrayTexture;
    this.userData = JSON.parse(JSON.stringify(source.userData));
    this.needsUpdate = true;
    return this;
  }
  /**
   * Sets this texture's properties based on `values`.
   * @param {Object} values - A container with texture parameters.
   */
  setValues(values) {
    for (const key in values) {
      const newValue = values[key];
      if (newValue === void 0) {
        warn(`Texture.setValues(): parameter '${key}' has value of undefined.`);
        continue;
      }
      const currentValue = this[key];
      if (currentValue === void 0) {
        warn(`Texture.setValues(): property '${key}' does not exist.`);
        continue;
      }
      if (currentValue && newValue && (currentValue.isVector2 && newValue.isVector2)) {
        currentValue.copy(newValue);
      } else if (currentValue && newValue && (currentValue.isVector3 && newValue.isVector3)) {
        currentValue.copy(newValue);
      } else if (currentValue && newValue && (currentValue.isMatrix3 && newValue.isMatrix3)) {
        currentValue.copy(newValue);
      } else {
        this[key] = newValue;
      }
    }
  }
  /**
   * Serializes the texture into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized texture.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (!isRootObject && meta.textures[this.uuid] !== void 0) {
      return meta.textures[this.uuid];
    }
    const output = {
      metadata: {
        version: 4.7,
        type: "Texture",
        generator: "Texture.toJSON"
      },
      uuid: this.uuid,
      name: this.name,
      image: this.source.toJSON(meta).uuid,
      mapping: this.mapping,
      channel: this.channel,
      repeat: [this.repeat.x, this.repeat.y],
      offset: [this.offset.x, this.offset.y],
      center: [this.center.x, this.center.y],
      rotation: this.rotation,
      wrap: [this.wrapS, this.wrapT],
      format: this.format,
      internalFormat: this.internalFormat,
      type: this.type,
      colorSpace: this.colorSpace,
      minFilter: this.minFilter,
      magFilter: this.magFilter,
      anisotropy: this.anisotropy,
      flipY: this.flipY,
      generateMipmaps: this.generateMipmaps,
      premultiplyAlpha: this.premultiplyAlpha,
      unpackAlignment: this.unpackAlignment
    };
    if (Object.keys(this.userData).length > 0) output.userData = this.userData;
    if (!isRootObject) {
      meta.textures[this.uuid] = output;
    }
    return output;
  }
  /**
   * Frees the GPU-related resources allocated by this instance. Call this
   * method whenever this instance is no longer used in your app.
   *
   * @fires Texture#dispose
   */
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
  /**
   * Transforms the given uv vector with the textures uv transformation matrix.
   *
   * @param {Vector2} uv - The uv vector.
   * @return {Vector2} The transformed uv vector.
   */
  transformUv(uv) {
    if (this.mapping !== UVMapping) return uv;
    uv.applyMatrix3(this.matrix);
    if (uv.x < 0 || uv.x > 1) {
      switch (this.wrapS) {
        case RepeatWrapping:
          uv.x = uv.x - Math.floor(uv.x);
          break;
        case ClampToEdgeWrapping:
          uv.x = uv.x < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.x) % 2) === 1) {
            uv.x = Math.ceil(uv.x) - uv.x;
          } else {
            uv.x = uv.x - Math.floor(uv.x);
          }
          break;
      }
    }
    if (uv.y < 0 || uv.y > 1) {
      switch (this.wrapT) {
        case RepeatWrapping:
          uv.y = uv.y - Math.floor(uv.y);
          break;
        case ClampToEdgeWrapping:
          uv.y = uv.y < 0 ? 0 : 1;
          break;
        case MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.y) % 2) === 1) {
            uv.y = Math.ceil(uv.y) - uv.y;
          } else {
            uv.y = uv.y - Math.floor(uv.y);
          }
          break;
      }
    }
    if (this.flipY) {
      uv.y = 1 - uv.y;
    }
    return uv;
  }
  /**
   * Setting this property to `true` indicates the engine the texture
   * must be updated in the next render. This triggers a texture upload
   * to the GPU and ensures correct texture parameter configuration.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) {
      this.version++;
      this.source.needsUpdate = true;
    }
  }
  /**
   * Setting this property to `true` indicates the engine the PMREM
   * must be regenerated.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsPMREMUpdate(value) {
    if (value === true) {
      this.pmremVersion++;
    }
  }
}
Texture.DEFAULT_IMAGE = null;
Texture.DEFAULT_MAPPING = UVMapping;
Texture.DEFAULT_ANISOTROPY = 1;
class Vector4 {
  /**
   * Constructs a new 4D vector.
   *
   * @param {number} [x=0] - The x value of this vector.
   * @param {number} [y=0] - The y value of this vector.
   * @param {number} [z=0] - The z value of this vector.
   * @param {number} [w=1] - The w value of this vector.
   */
  constructor(x = 0, y = 0, z = 0, w = 1) {
    Vector4.prototype.isVector4 = true;
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  /**
   * Alias for {@link Vector4#z}.
   *
   * @type {number}
   */
  get width() {
    return this.z;
  }
  set width(value) {
    this.z = value;
  }
  /**
   * Alias for {@link Vector4#w}.
   *
   * @type {number}
   */
  get height() {
    return this.w;
  }
  set height(value) {
    this.w = value;
  }
  /**
   * Sets the vector components.
   *
   * @param {number} x - The value of the x component.
   * @param {number} y - The value of the y component.
   * @param {number} z - The value of the z component.
   * @param {number} w - The value of the w component.
   * @return {Vector4} A reference to this vector.
   */
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
  /**
   * Sets the vector components to the same value.
   *
   * @param {number} scalar - The value to set for all vector components.
   * @return {Vector4} A reference to this vector.
   */
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    this.w = scalar;
    return this;
  }
  /**
   * Sets the vector's x component to the given value
   *
   * @param {number} x - The value to set.
   * @return {Vector4} A reference to this vector.
   */
  setX(x) {
    this.x = x;
    return this;
  }
  /**
   * Sets the vector's y component to the given value
   *
   * @param {number} y - The value to set.
   * @return {Vector4} A reference to this vector.
   */
  setY(y) {
    this.y = y;
    return this;
  }
  /**
   * Sets the vector's z component to the given value
   *
   * @param {number} z - The value to set.
   * @return {Vector4} A reference to this vector.
   */
  setZ(z) {
    this.z = z;
    return this;
  }
  /**
   * Sets the vector's w component to the given value
   *
   * @param {number} w - The value to set.
   * @return {Vector4} A reference to this vector.
   */
  setW(w) {
    this.w = w;
    return this;
  }
  /**
   * Allows to set a vector component with an index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y,
   * `2` equals to z, `3` equals to w.
   * @param {number} value - The value to set.
   * @return {Vector4} A reference to this vector.
   */
  setComponent(index2, value) {
    switch (index2) {
      case 0:
        this.x = value;
        break;
      case 1:
        this.y = value;
        break;
      case 2:
        this.z = value;
        break;
      case 3:
        this.w = value;
        break;
      default:
        throw new Error("index is out of range: " + index2);
    }
    return this;
  }
  /**
   * Returns the value of the vector component which matches the given index.
   *
   * @param {number} index - The component index. `0` equals to x, `1` equals to y,
   * `2` equals to z, `3` equals to w.
   * @return {number} A vector component value.
   */
  getComponent(index2) {
    switch (index2) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      case 3:
        return this.w;
      default:
        throw new Error("index is out of range: " + index2);
    }
  }
  /**
   * Returns a new vector with copied values from this instance.
   *
   * @return {Vector4} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.x, this.y, this.z, this.w);
  }
  /**
   * Copies the values of the given vector to this instance.
   *
   * @param {Vector3|Vector4} v - The vector to copy.
   * @return {Vector4} A reference to this vector.
   */
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    this.w = v.w !== void 0 ? v.w : 1;
    return this;
  }
  /**
   * Adds the given vector to this instance.
   *
   * @param {Vector4} v - The vector to add.
   * @return {Vector4} A reference to this vector.
   */
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    this.w += v.w;
    return this;
  }
  /**
   * Adds the given scalar value to all components of this instance.
   *
   * @param {number} s - The scalar to add.
   * @return {Vector4} A reference to this vector.
   */
  addScalar(s2) {
    this.x += s2;
    this.y += s2;
    this.z += s2;
    this.w += s2;
    return this;
  }
  /**
   * Adds the given vectors and stores the result in this instance.
   *
   * @param {Vector4} a - The first vector.
   * @param {Vector4} b - The second vector.
   * @return {Vector4} A reference to this vector.
   */
  addVectors(a2, b2) {
    this.x = a2.x + b2.x;
    this.y = a2.y + b2.y;
    this.z = a2.z + b2.z;
    this.w = a2.w + b2.w;
    return this;
  }
  /**
   * Adds the given vector scaled by the given factor to this instance.
   *
   * @param {Vector4} v - The vector.
   * @param {number} s - The factor that scales `v`.
   * @return {Vector4} A reference to this vector.
   */
  addScaledVector(v, s2) {
    this.x += v.x * s2;
    this.y += v.y * s2;
    this.z += v.z * s2;
    this.w += v.w * s2;
    return this;
  }
  /**
   * Subtracts the given vector from this instance.
   *
   * @param {Vector4} v - The vector to subtract.
   * @return {Vector4} A reference to this vector.
   */
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    this.w -= v.w;
    return this;
  }
  /**
   * Subtracts the given scalar value from all components of this instance.
   *
   * @param {number} s - The scalar to subtract.
   * @return {Vector4} A reference to this vector.
   */
  subScalar(s2) {
    this.x -= s2;
    this.y -= s2;
    this.z -= s2;
    this.w -= s2;
    return this;
  }
  /**
   * Subtracts the given vectors and stores the result in this instance.
   *
   * @param {Vector4} a - The first vector.
   * @param {Vector4} b - The second vector.
   * @return {Vector4} A reference to this vector.
   */
  subVectors(a2, b2) {
    this.x = a2.x - b2.x;
    this.y = a2.y - b2.y;
    this.z = a2.z - b2.z;
    this.w = a2.w - b2.w;
    return this;
  }
  /**
   * Multiplies the given vector with this instance.
   *
   * @param {Vector4} v - The vector to multiply.
   * @return {Vector4} A reference to this vector.
   */
  multiply(v) {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    this.w *= v.w;
    return this;
  }
  /**
   * Multiplies the given scalar value with all components of this instance.
   *
   * @param {number} scalar - The scalar to multiply.
   * @return {Vector4} A reference to this vector.
   */
  multiplyScalar(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    this.w *= scalar;
    return this;
  }
  /**
   * Multiplies this vector with the given 4x4 matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector4} A reference to this vector.
   */
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const e2 = m.elements;
    this.x = e2[0] * x + e2[4] * y + e2[8] * z + e2[12] * w;
    this.y = e2[1] * x + e2[5] * y + e2[9] * z + e2[13] * w;
    this.z = e2[2] * x + e2[6] * y + e2[10] * z + e2[14] * w;
    this.w = e2[3] * x + e2[7] * y + e2[11] * z + e2[15] * w;
    return this;
  }
  /**
   * Divides this instance by the given vector.
   *
   * @param {Vector4} v - The vector to divide.
   * @return {Vector4} A reference to this vector.
   */
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    this.z /= v.z;
    this.w /= v.w;
    return this;
  }
  /**
   * Divides this vector by the given scalar.
   *
   * @param {number} scalar - The scalar to divide.
   * @return {Vector4} A reference to this vector.
   */
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  /**
   * Sets the x, y and z components of this
   * vector to the quaternion's axis and w to the angle.
   *
   * @param {Quaternion} q - The Quaternion to set.
   * @return {Vector4} A reference to this vector.
   */
  setAxisAngleFromQuaternion(q) {
    this.w = 2 * Math.acos(q.w);
    const s2 = Math.sqrt(1 - q.w * q.w);
    if (s2 < 1e-4) {
      this.x = 1;
      this.y = 0;
      this.z = 0;
    } else {
      this.x = q.x / s2;
      this.y = q.y / s2;
      this.z = q.z / s2;
    }
    return this;
  }
  /**
   * Sets the x, y and z components of this
   * vector to the axis of rotation and w to the angle.
   *
   * @param {Matrix4} m - A 4x4 matrix of which the upper left 3x3 matrix is a pure rotation matrix.
   * @return {Vector4} A reference to this vector.
   */
  setAxisAngleFromRotationMatrix(m) {
    let angle, x, y, z;
    const epsilon = 0.01, epsilon2 = 0.1, te = m.elements, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9], m31 = te[2], m32 = te[6], m33 = te[10];
    if (Math.abs(m12 - m21) < epsilon && Math.abs(m13 - m31) < epsilon && Math.abs(m23 - m32) < epsilon) {
      if (Math.abs(m12 + m21) < epsilon2 && Math.abs(m13 + m31) < epsilon2 && Math.abs(m23 + m32) < epsilon2 && Math.abs(m11 + m22 + m33 - 3) < epsilon2) {
        this.set(1, 0, 0, 0);
        return this;
      }
      angle = Math.PI;
      const xx = (m11 + 1) / 2;
      const yy = (m22 + 1) / 2;
      const zz = (m33 + 1) / 2;
      const xy = (m12 + m21) / 4;
      const xz = (m13 + m31) / 4;
      const yz = (m23 + m32) / 4;
      if (xx > yy && xx > zz) {
        if (xx < epsilon) {
          x = 0;
          y = 0.707106781;
          z = 0.707106781;
        } else {
          x = Math.sqrt(xx);
          y = xy / x;
          z = xz / x;
        }
      } else if (yy > zz) {
        if (yy < epsilon) {
          x = 0.707106781;
          y = 0;
          z = 0.707106781;
        } else {
          y = Math.sqrt(yy);
          x = xy / y;
          z = yz / y;
        }
      } else {
        if (zz < epsilon) {
          x = 0.707106781;
          y = 0.707106781;
          z = 0;
        } else {
          z = Math.sqrt(zz);
          x = xz / z;
          y = yz / z;
        }
      }
      this.set(x, y, z, angle);
      return this;
    }
    let s2 = Math.sqrt((m32 - m23) * (m32 - m23) + (m13 - m31) * (m13 - m31) + (m21 - m12) * (m21 - m12));
    if (Math.abs(s2) < 1e-3) s2 = 1;
    this.x = (m32 - m23) / s2;
    this.y = (m13 - m31) / s2;
    this.z = (m21 - m12) / s2;
    this.w = Math.acos((m11 + m22 + m33 - 1) / 2);
    return this;
  }
  /**
   * Sets the vector components to the position elements of the
   * given transformation matrix.
   *
   * @param {Matrix4} m - The 4x4 matrix.
   * @return {Vector4} A reference to this vector.
   */
  setFromMatrixPosition(m) {
    const e2 = m.elements;
    this.x = e2[12];
    this.y = e2[13];
    this.z = e2[14];
    this.w = e2[15];
    return this;
  }
  /**
   * If this vector's x, y, z or w value is greater than the given vector's x, y, z or w
   * value, replace that value with the corresponding min value.
   *
   * @param {Vector4} v - The vector.
   * @return {Vector4} A reference to this vector.
   */
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    this.w = Math.min(this.w, v.w);
    return this;
  }
  /**
   * If this vector's x, y, z or w value is less than the given vector's x, y, z or w
   * value, replace that value with the corresponding max value.
   *
   * @param {Vector4} v - The vector.
   * @return {Vector4} A reference to this vector.
   */
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    this.w = Math.max(this.w, v.w);
    return this;
  }
  /**
   * If this vector's x, y, z or w value is greater than the max vector's x, y, z or w
   * value, it is replaced by the corresponding value.
   * If this vector's x, y, z or w value is less than the min vector's x, y, z or w value,
   * it is replaced by the corresponding value.
   *
   * @param {Vector4} min - The minimum x, y and z values.
   * @param {Vector4} max - The maximum x, y and z values in the desired range.
   * @return {Vector4} A reference to this vector.
   */
  clamp(min, max) {
    this.x = clamp(this.x, min.x, max.x);
    this.y = clamp(this.y, min.y, max.y);
    this.z = clamp(this.z, min.z, max.z);
    this.w = clamp(this.w, min.w, max.w);
    return this;
  }
  /**
   * If this vector's x, y, z or w values are greater than the max value, they are
   * replaced by the max value.
   * If this vector's x, y, z or w values are less than the min value, they are
   * replaced by the min value.
   *
   * @param {number} minVal - The minimum value the components will be clamped to.
   * @param {number} maxVal - The maximum value the components will be clamped to.
   * @return {Vector4} A reference to this vector.
   */
  clampScalar(minVal, maxVal) {
    this.x = clamp(this.x, minVal, maxVal);
    this.y = clamp(this.y, minVal, maxVal);
    this.z = clamp(this.z, minVal, maxVal);
    this.w = clamp(this.w, minVal, maxVal);
    return this;
  }
  /**
   * If this vector's length is greater than the max value, it is replaced by
   * the max value.
   * If this vector's length is less than the min value, it is replaced by the
   * min value.
   *
   * @param {number} min - The minimum value the vector length will be clamped to.
   * @param {number} max - The maximum value the vector length will be clamped to.
   * @return {Vector4} A reference to this vector.
   */
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(clamp(length, min, max));
  }
  /**
   * The components of this vector are rounded down to the nearest integer value.
   *
   * @return {Vector4} A reference to this vector.
   */
  floor() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    this.w = Math.floor(this.w);
    return this;
  }
  /**
   * The components of this vector are rounded up to the nearest integer value.
   *
   * @return {Vector4} A reference to this vector.
   */
  ceil() {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    this.w = Math.ceil(this.w);
    return this;
  }
  /**
   * The components of this vector are rounded to the nearest integer value
   *
   * @return {Vector4} A reference to this vector.
   */
  round() {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    this.w = Math.round(this.w);
    return this;
  }
  /**
   * The components of this vector are rounded towards zero (up if negative,
   * down if positive) to an integer value.
   *
   * @return {Vector4} A reference to this vector.
   */
  roundToZero() {
    this.x = Math.trunc(this.x);
    this.y = Math.trunc(this.y);
    this.z = Math.trunc(this.z);
    this.w = Math.trunc(this.w);
    return this;
  }
  /**
   * Inverts this vector - i.e. sets x = -x, y = -y, z = -z, w = -w.
   *
   * @return {Vector4} A reference to this vector.
   */
  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    this.w = -this.w;
    return this;
  }
  /**
   * Calculates the dot product of the given vector with this instance.
   *
   * @param {Vector4} v - The vector to compute the dot product with.
   * @return {number} The result of the dot product.
   */
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
  }
  /**
   * Computes the square of the Euclidean length (straight-line length) from
   * (0, 0, 0, 0) to (x, y, z, w). If you are comparing the lengths of vectors, you should
   * compare the length squared instead as it is slightly more efficient to calculate.
   *
   * @return {number} The square length of this vector.
   */
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }
  /**
   * Computes the  Euclidean length (straight-line length) from (0, 0, 0, 0) to (x, y, z, w).
   *
   * @return {number} The length of this vector.
   */
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }
  /**
   * Computes the Manhattan length of this vector.
   *
   * @return {number} The length of this vector.
   */
  manhattanLength() {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w);
  }
  /**
   * Converts this vector to a unit vector - that is, sets it equal to a vector
   * with the same direction as this one, but with a vector length of `1`.
   *
   * @return {Vector4} A reference to this vector.
   */
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  /**
   * Sets this vector to a vector with the same direction as this one, but
   * with the specified length.
   *
   * @param {number} length - The new length of this vector.
   * @return {Vector4} A reference to this vector.
   */
  setLength(length) {
    return this.normalize().multiplyScalar(length);
  }
  /**
   * Linearly interpolates between the given vector and this instance, where
   * alpha is the percent distance along the line - alpha = 0 will be this
   * vector, and alpha = 1 will be the given one.
   *
   * @param {Vector4} v - The vector to interpolate towards.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector4} A reference to this vector.
   */
  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    this.w += (v.w - this.w) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given vectors, where alpha is the percent
   * distance along the line - alpha = 0 will be first vector, and alpha = 1 will
   * be the second one. The result is stored in this instance.
   *
   * @param {Vector4} v1 - The first vector.
   * @param {Vector4} v2 - The second vector.
   * @param {number} alpha - The interpolation factor, typically in the closed interval `[0, 1]`.
   * @return {Vector4} A reference to this vector.
   */
  lerpVectors(v1, v2, alpha) {
    this.x = v1.x + (v2.x - v1.x) * alpha;
    this.y = v1.y + (v2.y - v1.y) * alpha;
    this.z = v1.z + (v2.z - v1.z) * alpha;
    this.w = v1.w + (v2.w - v1.w) * alpha;
    return this;
  }
  /**
   * Returns `true` if this vector is equal with the given one.
   *
   * @param {Vector4} v - The vector to test for equality.
   * @return {boolean} Whether this vector is equal with the given one.
   */
  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
  }
  /**
   * Sets this vector's x value to be `array[ offset ]`, y value to be `array[ offset + 1 ]`,
   * z value to be `array[ offset + 2 ]`, w value to be `array[ offset + 3 ]`.
   *
   * @param {Array<number>} array - An array holding the vector component values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Vector4} A reference to this vector.
   */
  fromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    this.w = array[offset + 3];
    return this;
  }
  /**
   * Writes the components of this vector to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the vector components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The vector components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    array[offset + 3] = this.w;
    return array;
  }
  /**
   * Sets the components of this vector from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding vector data.
   * @param {number} index - The index into the attribute.
   * @return {Vector4} A reference to this vector.
   */
  fromBufferAttribute(attribute, index2) {
    this.x = attribute.getX(index2);
    this.y = attribute.getY(index2);
    this.z = attribute.getZ(index2);
    this.w = attribute.getW(index2);
    return this;
  }
  /**
   * Sets each component of this vector to a pseudo-random value between `0` and
   * `1`, excluding `1`.
   *
   * @return {Vector4} A reference to this vector.
   */
  random() {
    this.x = Math.random();
    this.y = Math.random();
    this.z = Math.random();
    this.w = Math.random();
    return this;
  }
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
    yield this.w;
  }
}
class Box3 {
  /**
   * Constructs a new bounding box.
   *
   * @param {Vector3} [min=(Infinity,Infinity,Infinity)] - A vector representing the lower boundary of the box.
   * @param {Vector3} [max=(-Infinity,-Infinity,-Infinity)] - A vector representing the upper boundary of the box.
   */
  constructor(min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)) {
    this.isBox3 = true;
    this.min = min;
    this.max = max;
  }
  /**
   * Sets the lower and upper boundaries of this box.
   * Please note that this method only copies the values from the given objects.
   *
   * @param {Vector3} min - The lower boundary of the box.
   * @param {Vector3} max - The upper boundary of the box.
   * @return {Box3} A reference to this bounding box.
   */
  set(min, max) {
    this.min.copy(min);
    this.max.copy(max);
    return this;
  }
  /**
   * Sets the upper and lower bounds of this box so it encloses the position data
   * in the given array.
   *
   * @param {Array<number>} array - An array holding 3D position data.
   * @return {Box3} A reference to this bounding box.
   */
  setFromArray(array) {
    this.makeEmpty();
    for (let i = 0, il = array.length; i < il; i += 3) {
      this.expandByPoint(_vector$b.fromArray(array, i));
    }
    return this;
  }
  /**
   * Sets the upper and lower bounds of this box so it encloses the position data
   * in the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - A buffer attribute holding 3D position data.
   * @return {Box3} A reference to this bounding box.
   */
  setFromBufferAttribute(attribute) {
    this.makeEmpty();
    for (let i = 0, il = attribute.count; i < il; i++) {
      this.expandByPoint(_vector$b.fromBufferAttribute(attribute, i));
    }
    return this;
  }
  /**
   * Sets the upper and lower bounds of this box so it encloses the position data
   * in the given array.
   *
   * @param {Array<Vector3>} points - An array holding 3D position data as instances of {@link Vector3}.
   * @return {Box3} A reference to this bounding box.
   */
  setFromPoints(points) {
    this.makeEmpty();
    for (let i = 0, il = points.length; i < il; i++) {
      this.expandByPoint(points[i]);
    }
    return this;
  }
  /**
   * Centers this box on the given center vector and sets this box's width, height and
   * depth to the given size values.
   *
   * @param {Vector3} center - The center of the box.
   * @param {Vector3} size - The x, y and z dimensions of the box.
   * @return {Box3} A reference to this bounding box.
   */
  setFromCenterAndSize(center, size) {
    const halfSize = _vector$b.copy(size).multiplyScalar(0.5);
    this.min.copy(center).sub(halfSize);
    this.max.copy(center).add(halfSize);
    return this;
  }
  /**
   * Computes the world-axis-aligned bounding box for the given 3D object
   * (including its children), accounting for the object's, and children's,
   * world transforms. The function may result in a larger box than strictly necessary.
   *
   * @param {Object3D} object - The 3D object to compute the bounding box for.
   * @param {boolean} [precise=false] - If set to `true`, the method computes the smallest
   * world-axis-aligned bounding box at the expense of more computation.
   * @return {Box3} A reference to this bounding box.
   */
  setFromObject(object2, precise = false) {
    this.makeEmpty();
    return this.expandByObject(object2, precise);
  }
  /**
   * Returns a new box with copied values from this instance.
   *
   * @return {Box3} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given box to this instance.
   *
   * @param {Box3} box - The box to copy.
   * @return {Box3} A reference to this bounding box.
   */
  copy(box) {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }
  /**
   * Makes this box empty which means in encloses a zero space in 3D.
   *
   * @return {Box3} A reference to this bounding box.
   */
  makeEmpty() {
    this.min.x = this.min.y = this.min.z = Infinity;
    this.max.x = this.max.y = this.max.z = -Infinity;
    return this;
  }
  /**
   * Returns true if this box includes zero points within its bounds.
   * Note that a box with equal lower and upper bounds still includes one
   * point, the one both bounds share.
   *
   * @return {boolean} Whether this box is empty or not.
   */
  isEmpty() {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }
  /**
   * Returns the center point of this box.
   *
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The center point.
   */
  getCenter(target) {
    return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }
  /**
   * Returns the dimensions of this box.
   *
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The size.
   */
  getSize(target) {
    return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
  }
  /**
   * Expands the boundaries of this box to include the given point.
   *
   * @param {Vector3} point - The point that should be included by the bounding box.
   * @return {Box3} A reference to this bounding box.
   */
  expandByPoint(point) {
    this.min.min(point);
    this.max.max(point);
    return this;
  }
  /**
   * Expands this box equilaterally by the given vector. The width of this
   * box will be expanded by the x component of the vector in both
   * directions. The height of this box will be expanded by the y component of
   * the vector in both directions. The depth of this box will be
   * expanded by the z component of the vector in both directions.
   *
   * @param {Vector3} vector - The vector that should expand the bounding box.
   * @return {Box3} A reference to this bounding box.
   */
  expandByVector(vector) {
    this.min.sub(vector);
    this.max.add(vector);
    return this;
  }
  /**
   * Expands each dimension of the box by the given scalar. If negative, the
   * dimensions of the box will be contracted.
   *
   * @param {number} scalar - The scalar value that should expand the bounding box.
   * @return {Box3} A reference to this bounding box.
   */
  expandByScalar(scalar) {
    this.min.addScalar(-scalar);
    this.max.addScalar(scalar);
    return this;
  }
  /**
   * Expands the boundaries of this box to include the given 3D object and
   * its children, accounting for the object's, and children's, world
   * transforms. The function may result in a larger box than strictly
   * necessary (unless the precise parameter is set to true).
   *
   * @param {Object3D} object - The 3D object that should expand the bounding box.
   * @param {boolean} precise - If set to `true`, the method expands the bounding box
   * as little as necessary at the expense of more computation.
   * @return {Box3} A reference to this bounding box.
   */
  expandByObject(object2, precise = false) {
    object2.updateWorldMatrix(false, false);
    const geometry = object2.geometry;
    if (geometry !== void 0) {
      const positionAttribute = geometry.getAttribute("position");
      if (precise === true && positionAttribute !== void 0 && object2.isInstancedMesh !== true) {
        for (let i = 0, l2 = positionAttribute.count; i < l2; i++) {
          if (object2.isMesh === true) {
            object2.getVertexPosition(i, _vector$b);
          } else {
            _vector$b.fromBufferAttribute(positionAttribute, i);
          }
          _vector$b.applyMatrix4(object2.matrixWorld);
          this.expandByPoint(_vector$b);
        }
      } else {
        if (object2.boundingBox !== void 0) {
          if (object2.boundingBox === null) {
            object2.computeBoundingBox();
          }
          _box$4.copy(object2.boundingBox);
        } else {
          if (geometry.boundingBox === null) {
            geometry.computeBoundingBox();
          }
          _box$4.copy(geometry.boundingBox);
        }
        _box$4.applyMatrix4(object2.matrixWorld);
        this.union(_box$4);
      }
    }
    const children = object2.children;
    for (let i = 0, l2 = children.length; i < l2; i++) {
      this.expandByObject(children[i], precise);
    }
    return this;
  }
  /**
   * Returns `true` if the given point lies within or on the boundaries of this box.
   *
   * @param {Vector3} point - The point to test.
   * @return {boolean} Whether the bounding box contains the given point or not.
   */
  containsPoint(point) {
    return point.x >= this.min.x && point.x <= this.max.x && point.y >= this.min.y && point.y <= this.max.y && point.z >= this.min.z && point.z <= this.max.z;
  }
  /**
   * Returns `true` if this bounding box includes the entirety of the given bounding box.
   * If this box and the given one are identical, this function also returns `true`.
   *
   * @param {Box3} box - The bounding box to test.
   * @return {boolean} Whether the bounding box contains the given bounding box or not.
   */
  containsBox(box) {
    return this.min.x <= box.min.x && box.max.x <= this.max.x && this.min.y <= box.min.y && box.max.y <= this.max.y && this.min.z <= box.min.z && box.max.z <= this.max.z;
  }
  /**
   * Returns a point as a proportion of this box's width, height and depth.
   *
   * @param {Vector3} point - A point in 3D space.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} A point as a proportion of this box's width, height and depth.
   */
  getParameter(point, target) {
    return target.set(
      (point.x - this.min.x) / (this.max.x - this.min.x),
      (point.y - this.min.y) / (this.max.y - this.min.y),
      (point.z - this.min.z) / (this.max.z - this.min.z)
    );
  }
  /**
   * Returns `true` if the given bounding box intersects with this bounding box.
   *
   * @param {Box3} box - The bounding box to test.
   * @return {boolean} Whether the given bounding box intersects with this bounding box.
   */
  intersectsBox(box) {
    return box.max.x >= this.min.x && box.min.x <= this.max.x && box.max.y >= this.min.y && box.min.y <= this.max.y && box.max.z >= this.min.z && box.min.z <= this.max.z;
  }
  /**
   * Returns `true` if the given bounding sphere intersects with this bounding box.
   *
   * @param {Sphere} sphere - The bounding sphere to test.
   * @return {boolean} Whether the given bounding sphere intersects with this bounding box.
   */
  intersectsSphere(sphere) {
    this.clampPoint(sphere.center, _vector$b);
    return _vector$b.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }
  /**
   * Returns `true` if the given plane intersects with this bounding box.
   *
   * @param {Plane} plane - The plane to test.
   * @return {boolean} Whether the given plane intersects with this bounding box.
   */
  intersectsPlane(plane) {
    let min, max;
    if (plane.normal.x > 0) {
      min = plane.normal.x * this.min.x;
      max = plane.normal.x * this.max.x;
    } else {
      min = plane.normal.x * this.max.x;
      max = plane.normal.x * this.min.x;
    }
    if (plane.normal.y > 0) {
      min += plane.normal.y * this.min.y;
      max += plane.normal.y * this.max.y;
    } else {
      min += plane.normal.y * this.max.y;
      max += plane.normal.y * this.min.y;
    }
    if (plane.normal.z > 0) {
      min += plane.normal.z * this.min.z;
      max += plane.normal.z * this.max.z;
    } else {
      min += plane.normal.z * this.max.z;
      max += plane.normal.z * this.min.z;
    }
    return min <= -plane.constant && max >= -plane.constant;
  }
  /**
   * Returns `true` if the given triangle intersects with this bounding box.
   *
   * @param {Triangle} triangle - The triangle to test.
   * @return {boolean} Whether the given triangle intersects with this bounding box.
   */
  intersectsTriangle(triangle) {
    if (this.isEmpty()) {
      return false;
    }
    this.getCenter(_center);
    _extents.subVectors(this.max, _center);
    _v0$2.subVectors(triangle.a, _center);
    _v1$7.subVectors(triangle.b, _center);
    _v2$4.subVectors(triangle.c, _center);
    _f0.subVectors(_v1$7, _v0$2);
    _f1.subVectors(_v2$4, _v1$7);
    _f2.subVectors(_v0$2, _v2$4);
    let axes = [
      0,
      -_f0.z,
      _f0.y,
      0,
      -_f1.z,
      _f1.y,
      0,
      -_f2.z,
      _f2.y,
      _f0.z,
      0,
      -_f0.x,
      _f1.z,
      0,
      -_f1.x,
      _f2.z,
      0,
      -_f2.x,
      -_f0.y,
      _f0.x,
      0,
      -_f1.y,
      _f1.x,
      0,
      -_f2.y,
      _f2.x,
      0
    ];
    if (!satForAxes(axes, _v0$2, _v1$7, _v2$4, _extents)) {
      return false;
    }
    axes = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (!satForAxes(axes, _v0$2, _v1$7, _v2$4, _extents)) {
      return false;
    }
    _triangleNormal.crossVectors(_f0, _f1);
    axes = [_triangleNormal.x, _triangleNormal.y, _triangleNormal.z];
    return satForAxes(axes, _v0$2, _v1$7, _v2$4, _extents);
  }
  /**
   * Clamps the given point within the bounds of this box.
   *
   * @param {Vector3} point - The point to clamp.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The clamped point.
   */
  clampPoint(point, target) {
    return target.copy(point).clamp(this.min, this.max);
  }
  /**
   * Returns the euclidean distance from any edge of this box to the specified point. If
   * the given point lies inside of this box, the distance will be `0`.
   *
   * @param {Vector3} point - The point to compute the distance to.
   * @return {number} The euclidean distance.
   */
  distanceToPoint(point) {
    return this.clampPoint(point, _vector$b).distanceTo(point);
  }
  /**
   * Returns a bounding sphere that encloses this bounding box.
   *
   * @param {Sphere} target - The target sphere that is used to store the method's result.
   * @return {Sphere} The bounding sphere that encloses this bounding box.
   */
  getBoundingSphere(target) {
    if (this.isEmpty()) {
      target.makeEmpty();
    } else {
      this.getCenter(target.center);
      target.radius = this.getSize(_vector$b).length() * 0.5;
    }
    return target;
  }
  /**
   * Computes the intersection of this bounding box and the given one, setting the upper
   * bound of this box to the lesser of the two boxes' upper bounds and the
   * lower bound of this box to the greater of the two boxes' lower bounds. If
   * there's no overlap, makes this box empty.
   *
   * @param {Box3} box - The bounding box to intersect with.
   * @return {Box3} A reference to this bounding box.
   */
  intersect(box) {
    this.min.max(box.min);
    this.max.min(box.max);
    if (this.isEmpty()) this.makeEmpty();
    return this;
  }
  /**
   * Computes the union of this box and another and the given one, setting the upper
   * bound of this box to the greater of the two boxes' upper bounds and the
   * lower bound of this box to the lesser of the two boxes' lower bounds.
   *
   * @param {Box3} box - The bounding box that will be unioned with this instance.
   * @return {Box3} A reference to this bounding box.
   */
  union(box) {
    this.min.min(box.min);
    this.max.max(box.max);
    return this;
  }
  /**
   * Transforms this bounding box by the given 4x4 transformation matrix.
   *
   * @param {Matrix4} matrix - The transformation matrix.
   * @return {Box3} A reference to this bounding box.
   */
  applyMatrix4(matrix) {
    if (this.isEmpty()) return this;
    _points[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix);
    _points[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix);
    _points[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix);
    _points[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix);
    _points[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix);
    _points[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix);
    _points[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix);
    _points[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix);
    this.setFromPoints(_points);
    return this;
  }
  /**
   * Adds the given offset to both the upper and lower bounds of this bounding box,
   * effectively moving it in 3D space.
   *
   * @param {Vector3} offset - The offset that should be used to translate the bounding box.
   * @return {Box3} A reference to this bounding box.
   */
  translate(offset) {
    this.min.add(offset);
    this.max.add(offset);
    return this;
  }
  /**
   * Returns `true` if this bounding box is equal with the given one.
   *
   * @param {Box3} box - The box to test for equality.
   * @return {boolean} Whether this bounding box is equal with the given one.
   */
  equals(box) {
    return box.min.equals(this.min) && box.max.equals(this.max);
  }
  /**
   * Returns a serialized structure of the bounding box.
   *
   * @return {Object} Serialized structure with fields representing the object state.
   */
  toJSON() {
    return {
      min: this.min.toArray(),
      max: this.max.toArray()
    };
  }
  /**
   * Returns a serialized structure of the bounding box.
   *
   * @param {Object} json - The serialized json to set the box from.
   * @return {Box3} A reference to this bounding box.
   */
  fromJSON(json) {
    this.min.fromArray(json.min);
    this.max.fromArray(json.max);
    return this;
  }
}
const _points = [
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3(),
  /* @__PURE__ */ new Vector3()
];
const _vector$b = /* @__PURE__ */ new Vector3();
const _box$4 = /* @__PURE__ */ new Box3();
const _v0$2 = /* @__PURE__ */ new Vector3();
const _v1$7 = /* @__PURE__ */ new Vector3();
const _v2$4 = /* @__PURE__ */ new Vector3();
const _f0 = /* @__PURE__ */ new Vector3();
const _f1 = /* @__PURE__ */ new Vector3();
const _f2 = /* @__PURE__ */ new Vector3();
const _center = /* @__PURE__ */ new Vector3();
const _extents = /* @__PURE__ */ new Vector3();
const _triangleNormal = /* @__PURE__ */ new Vector3();
const _testAxis = /* @__PURE__ */ new Vector3();
function satForAxes(axes, v0, v1, v2, extents) {
  for (let i = 0, j = axes.length - 3; i <= j; i += 3) {
    _testAxis.fromArray(axes, i);
    const r2 = extents.x * Math.abs(_testAxis.x) + extents.y * Math.abs(_testAxis.y) + extents.z * Math.abs(_testAxis.z);
    const p0 = v0.dot(_testAxis);
    const p1 = v1.dot(_testAxis);
    const p2 = v2.dot(_testAxis);
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > r2) {
      return false;
    }
  }
  return true;
}
const _box$3 = /* @__PURE__ */ new Box3();
const _v1$6 = /* @__PURE__ */ new Vector3();
const _v2$3 = /* @__PURE__ */ new Vector3();
class Sphere {
  /**
   * Constructs a new sphere.
   *
   * @param {Vector3} [center=(0,0,0)] - The center of the sphere
   * @param {number} [radius=-1] - The radius of the sphere.
   */
  constructor(center = new Vector3(), radius = -1) {
    this.isSphere = true;
    this.center = center;
    this.radius = radius;
  }
  /**
   * Sets the sphere's components by copying the given values.
   *
   * @param {Vector3} center - The center.
   * @param {number} radius - The radius.
   * @return {Sphere} A reference to this sphere.
   */
  set(center, radius) {
    this.center.copy(center);
    this.radius = radius;
    return this;
  }
  /**
   * Computes the minimum bounding sphere for list of points.
   * If the optional center point is given, it is used as the sphere's
   * center. Otherwise, the center of the axis-aligned bounding box
   * encompassing the points is calculated.
   *
   * @param {Array<Vector3>} points - A list of points in 3D space.
   * @param {Vector3} [optionalCenter] - The center of the sphere.
   * @return {Sphere} A reference to this sphere.
   */
  setFromPoints(points, optionalCenter) {
    const center = this.center;
    if (optionalCenter !== void 0) {
      center.copy(optionalCenter);
    } else {
      _box$3.setFromPoints(points).getCenter(center);
    }
    let maxRadiusSq = 0;
    for (let i = 0, il = points.length; i < il; i++) {
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(points[i]));
    }
    this.radius = Math.sqrt(maxRadiusSq);
    return this;
  }
  /**
   * Copies the values of the given sphere to this instance.
   *
   * @param {Sphere} sphere - The sphere to copy.
   * @return {Sphere} A reference to this sphere.
   */
  copy(sphere) {
    this.center.copy(sphere.center);
    this.radius = sphere.radius;
    return this;
  }
  /**
   * Returns `true` if the sphere is empty (the radius set to a negative number).
   *
   * Spheres with a radius of `0` contain only their center point and are not
   * considered to be empty.
   *
   * @return {boolean} Whether this sphere is empty or not.
   */
  isEmpty() {
    return this.radius < 0;
  }
  /**
   * Makes this sphere empty which means in encloses a zero space in 3D.
   *
   * @return {Sphere} A reference to this sphere.
   */
  makeEmpty() {
    this.center.set(0, 0, 0);
    this.radius = -1;
    return this;
  }
  /**
   * Returns `true` if this sphere contains the given point inclusive of
   * the surface of the sphere.
   *
   * @param {Vector3} point - The point to check.
   * @return {boolean} Whether this sphere contains the given point or not.
   */
  containsPoint(point) {
    return point.distanceToSquared(this.center) <= this.radius * this.radius;
  }
  /**
   * Returns the closest distance from the boundary of the sphere to the
   * given point. If the sphere contains the point, the distance will
   * be negative.
   *
   * @param {Vector3} point - The point to compute the distance to.
   * @return {number} The distance to the point.
   */
  distanceToPoint(point) {
    return point.distanceTo(this.center) - this.radius;
  }
  /**
   * Returns `true` if this sphere intersects with the given one.
   *
   * @param {Sphere} sphere - The sphere to test.
   * @return {boolean} Whether this sphere intersects with the given one or not.
   */
  intersectsSphere(sphere) {
    const radiusSum = this.radius + sphere.radius;
    return sphere.center.distanceToSquared(this.center) <= radiusSum * radiusSum;
  }
  /**
   * Returns `true` if this sphere intersects with the given box.
   *
   * @param {Box3} box - The box to test.
   * @return {boolean} Whether this sphere intersects with the given box or not.
   */
  intersectsBox(box) {
    return box.intersectsSphere(this);
  }
  /**
   * Returns `true` if this sphere intersects with the given plane.
   *
   * @param {Plane} plane - The plane to test.
   * @return {boolean} Whether this sphere intersects with the given plane or not.
   */
  intersectsPlane(plane) {
    return Math.abs(plane.distanceToPoint(this.center)) <= this.radius;
  }
  /**
   * Clamps a point within the sphere. If the point is outside the sphere, it
   * will clamp it to the closest point on the edge of the sphere. Points
   * already inside the sphere will not be affected.
   *
   * @param {Vector3} point - The plane to clamp.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The clamped point.
   */
  clampPoint(point, target) {
    const deltaLengthSq = this.center.distanceToSquared(point);
    target.copy(point);
    if (deltaLengthSq > this.radius * this.radius) {
      target.sub(this.center).normalize();
      target.multiplyScalar(this.radius).add(this.center);
    }
    return target;
  }
  /**
   * Returns a bounding box that encloses this sphere.
   *
   * @param {Box3} target - The target box that is used to store the method's result.
   * @return {Box3} The bounding box that encloses this sphere.
   */
  getBoundingBox(target) {
    if (this.isEmpty()) {
      target.makeEmpty();
      return target;
    }
    target.set(this.center, this.center);
    target.expandByScalar(this.radius);
    return target;
  }
  /**
   * Transforms this sphere with the given 4x4 transformation matrix.
   *
   * @param {Matrix4} matrix - The transformation matrix.
   * @return {Sphere} A reference to this sphere.
   */
  applyMatrix4(matrix) {
    this.center.applyMatrix4(matrix);
    this.radius = this.radius * matrix.getMaxScaleOnAxis();
    return this;
  }
  /**
   * Translates the sphere's center by the given offset.
   *
   * @param {Vector3} offset - The offset.
   * @return {Sphere} A reference to this sphere.
   */
  translate(offset) {
    this.center.add(offset);
    return this;
  }
  /**
   * Expands the boundaries of this sphere to include the given point.
   *
   * @param {Vector3} point - The point to include.
   * @return {Sphere} A reference to this sphere.
   */
  expandByPoint(point) {
    if (this.isEmpty()) {
      this.center.copy(point);
      this.radius = 0;
      return this;
    }
    _v1$6.subVectors(point, this.center);
    const lengthSq = _v1$6.lengthSq();
    if (lengthSq > this.radius * this.radius) {
      const length = Math.sqrt(lengthSq);
      const delta = (length - this.radius) * 0.5;
      this.center.addScaledVector(_v1$6, delta / length);
      this.radius += delta;
    }
    return this;
  }
  /**
   * Expands this sphere to enclose both the original sphere and the given sphere.
   *
   * @param {Sphere} sphere - The sphere to include.
   * @return {Sphere} A reference to this sphere.
   */
  union(sphere) {
    if (sphere.isEmpty()) {
      return this;
    }
    if (this.isEmpty()) {
      this.copy(sphere);
      return this;
    }
    if (this.center.equals(sphere.center) === true) {
      this.radius = Math.max(this.radius, sphere.radius);
    } else {
      _v2$3.subVectors(sphere.center, this.center).setLength(sphere.radius);
      this.expandByPoint(_v1$6.copy(sphere.center).add(_v2$3));
      this.expandByPoint(_v1$6.copy(sphere.center).sub(_v2$3));
    }
    return this;
  }
  /**
   * Returns `true` if this sphere is equal with the given one.
   *
   * @param {Sphere} sphere - The sphere to test for equality.
   * @return {boolean} Whether this bounding sphere is equal with the given one.
   */
  equals(sphere) {
    return sphere.center.equals(this.center) && sphere.radius === this.radius;
  }
  /**
   * Returns a new sphere with copied values from this instance.
   *
   * @return {Sphere} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Returns a serialized structure of the bounding sphere.
   *
   * @return {Object} Serialized structure with fields representing the object state.
   */
  toJSON() {
    return {
      radius: this.radius,
      center: this.center.toArray()
    };
  }
  /**
   * Returns a serialized structure of the bounding sphere.
   *
   * @param {Object} json - The serialized json to set the sphere from.
   * @return {Box3} A reference to this bounding sphere.
   */
  fromJSON(json) {
    this.radius = json.radius;
    this.center.fromArray(json.center);
    return this;
  }
}
const _vector$a = /* @__PURE__ */ new Vector3();
const _segCenter = /* @__PURE__ */ new Vector3();
const _segDir = /* @__PURE__ */ new Vector3();
const _diff = /* @__PURE__ */ new Vector3();
const _edge1 = /* @__PURE__ */ new Vector3();
const _edge2 = /* @__PURE__ */ new Vector3();
const _normal$1 = /* @__PURE__ */ new Vector3();
class Ray {
  /**
   * Constructs a new ray.
   *
   * @param {Vector3} [origin=(0,0,0)] - The origin of the ray.
   * @param {Vector3} [direction=(0,0,-1)] - The (normalized) direction of the ray.
   */
  constructor(origin = new Vector3(), direction = new Vector3(0, 0, -1)) {
    this.origin = origin;
    this.direction = direction;
  }
  /**
   * Sets the ray's components by copying the given values.
   *
   * @param {Vector3} origin - The origin.
   * @param {Vector3} direction - The direction.
   * @return {Ray} A reference to this ray.
   */
  set(origin, direction) {
    this.origin.copy(origin);
    this.direction.copy(direction);
    return this;
  }
  /**
   * Copies the values of the given ray to this instance.
   *
   * @param {Ray} ray - The ray to copy.
   * @return {Ray} A reference to this ray.
   */
  copy(ray) {
    this.origin.copy(ray.origin);
    this.direction.copy(ray.direction);
    return this;
  }
  /**
   * Returns a vector that is located at a given distance along this ray.
   *
   * @param {number} t - The distance along the ray to retrieve a position for.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} A position on the ray.
   */
  at(t2, target) {
    return target.copy(this.origin).addScaledVector(this.direction, t2);
  }
  /**
   * Adjusts the direction of the ray to point at the given vector in world space.
   *
   * @param {Vector3} v - The target position.
   * @return {Ray} A reference to this ray.
   */
  lookAt(v) {
    this.direction.copy(v).sub(this.origin).normalize();
    return this;
  }
  /**
   * Shift the origin of this ray along its direction by the given distance.
   *
   * @param {number} t - The distance along the ray to interpolate.
   * @return {Ray} A reference to this ray.
   */
  recast(t2) {
    this.origin.copy(this.at(t2, _vector$a));
    return this;
  }
  /**
   * Returns the point along this ray that is closest to the given point.
   *
   * @param {Vector3} point - A point in 3D space to get the closet location on the ray for.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The closest point on this ray.
   */
  closestPointToPoint(point, target) {
    target.subVectors(point, this.origin);
    const directionDistance = target.dot(this.direction);
    if (directionDistance < 0) {
      return target.copy(this.origin);
    }
    return target.copy(this.origin).addScaledVector(this.direction, directionDistance);
  }
  /**
   * Returns the distance of the closest approach between this ray and the given point.
   *
   * @param {Vector3} point - A point in 3D space to compute the distance to.
   * @return {number} The distance.
   */
  distanceToPoint(point) {
    return Math.sqrt(this.distanceSqToPoint(point));
  }
  /**
   * Returns the squared distance of the closest approach between this ray and the given point.
   *
   * @param {Vector3} point - A point in 3D space to compute the distance to.
   * @return {number} The squared distance.
   */
  distanceSqToPoint(point) {
    const directionDistance = _vector$a.subVectors(point, this.origin).dot(this.direction);
    if (directionDistance < 0) {
      return this.origin.distanceToSquared(point);
    }
    _vector$a.copy(this.origin).addScaledVector(this.direction, directionDistance);
    return _vector$a.distanceToSquared(point);
  }
  /**
   * Returns the squared distance between this ray and the given line segment.
   *
   * @param {Vector3} v0 - The start point of the line segment.
   * @param {Vector3} v1 - The end point of the line segment.
   * @param {Vector3} [optionalPointOnRay] - When provided, it receives the point on this ray that is closest to the segment.
   * @param {Vector3} [optionalPointOnSegment] - When provided, it receives the point on the line segment that is closest to this ray.
   * @return {number} The squared distance.
   */
  distanceSqToSegment(v0, v1, optionalPointOnRay, optionalPointOnSegment) {
    _segCenter.copy(v0).add(v1).multiplyScalar(0.5);
    _segDir.copy(v1).sub(v0).normalize();
    _diff.copy(this.origin).sub(_segCenter);
    const segExtent = v0.distanceTo(v1) * 0.5;
    const a01 = -this.direction.dot(_segDir);
    const b0 = _diff.dot(this.direction);
    const b1 = -_diff.dot(_segDir);
    const c2 = _diff.lengthSq();
    const det = Math.abs(1 - a01 * a01);
    let s0, s1, sqrDist, extDet;
    if (det > 0) {
      s0 = a01 * b1 - b0;
      s1 = a01 * b0 - b1;
      extDet = segExtent * det;
      if (s0 >= 0) {
        if (s1 >= -extDet) {
          if (s1 <= extDet) {
            const invDet = 1 / det;
            s0 *= invDet;
            s1 *= invDet;
            sqrDist = s0 * (s0 + a01 * s1 + 2 * b0) + s1 * (a01 * s0 + s1 + 2 * b1) + c2;
          } else {
            s1 = segExtent;
            s0 = Math.max(0, -(a01 * s1 + b0));
            sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c2;
          }
        } else {
          s1 = -segExtent;
          s0 = Math.max(0, -(a01 * s1 + b0));
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c2;
        }
      } else {
        if (s1 <= -extDet) {
          s0 = Math.max(0, -(-a01 * segExtent + b0));
          s1 = s0 > 0 ? -segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c2;
        } else if (s1 <= extDet) {
          s0 = 0;
          s1 = Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = s1 * (s1 + 2 * b1) + c2;
        } else {
          s0 = Math.max(0, -(a01 * segExtent + b0));
          s1 = s0 > 0 ? segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c2;
        }
      }
    } else {
      s1 = a01 > 0 ? -segExtent : segExtent;
      s0 = Math.max(0, -(a01 * s1 + b0));
      sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c2;
    }
    if (optionalPointOnRay) {
      optionalPointOnRay.copy(this.origin).addScaledVector(this.direction, s0);
    }
    if (optionalPointOnSegment) {
      optionalPointOnSegment.copy(_segCenter).addScaledVector(_segDir, s1);
    }
    return sqrDist;
  }
  /**
   * Intersects this ray with the given sphere, returning the intersection
   * point or `null` if there is no intersection.
   *
   * @param {Sphere} sphere - The sphere to intersect.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The intersection point.
   */
  intersectSphere(sphere, target) {
    _vector$a.subVectors(sphere.center, this.origin);
    const tca = _vector$a.dot(this.direction);
    const d2 = _vector$a.dot(_vector$a) - tca * tca;
    const radius2 = sphere.radius * sphere.radius;
    if (d2 > radius2) return null;
    const thc = Math.sqrt(radius2 - d2);
    const t0 = tca - thc;
    const t1 = tca + thc;
    if (t1 < 0) return null;
    if (t0 < 0) return this.at(t1, target);
    return this.at(t0, target);
  }
  /**
   * Returns `true` if this ray intersects with the given sphere.
   *
   * @param {Sphere} sphere - The sphere to intersect.
   * @return {boolean} Whether this ray intersects with the given sphere or not.
   */
  intersectsSphere(sphere) {
    if (sphere.radius < 0) return false;
    return this.distanceSqToPoint(sphere.center) <= sphere.radius * sphere.radius;
  }
  /**
   * Computes the distance from the ray's origin to the given plane. Returns `null` if the ray
   * does not intersect with the plane.
   *
   * @param {Plane} plane - The plane to compute the distance to.
   * @return {?number} Whether this ray intersects with the given sphere or not.
   */
  distanceToPlane(plane) {
    const denominator = plane.normal.dot(this.direction);
    if (denominator === 0) {
      if (plane.distanceToPoint(this.origin) === 0) {
        return 0;
      }
      return null;
    }
    const t2 = -(this.origin.dot(plane.normal) + plane.constant) / denominator;
    return t2 >= 0 ? t2 : null;
  }
  /**
   * Intersects this ray with the given plane, returning the intersection
   * point or `null` if there is no intersection.
   *
   * @param {Plane} plane - The plane to intersect.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The intersection point.
   */
  intersectPlane(plane, target) {
    const t2 = this.distanceToPlane(plane);
    if (t2 === null) {
      return null;
    }
    return this.at(t2, target);
  }
  /**
   * Returns `true` if this ray intersects with the given plane.
   *
   * @param {Plane} plane - The plane to intersect.
   * @return {boolean} Whether this ray intersects with the given plane or not.
   */
  intersectsPlane(plane) {
    const distToPoint = plane.distanceToPoint(this.origin);
    if (distToPoint === 0) {
      return true;
    }
    const denominator = plane.normal.dot(this.direction);
    if (denominator * distToPoint < 0) {
      return true;
    }
    return false;
  }
  /**
   * Intersects this ray with the given bounding box, returning the intersection
   * point or `null` if there is no intersection.
   *
   * @param {Box3} box - The box to intersect.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The intersection point.
   */
  intersectBox(box, target) {
    let tmin, tmax, tymin, tymax, tzmin, tzmax;
    const invdirx = 1 / this.direction.x, invdiry = 1 / this.direction.y, invdirz = 1 / this.direction.z;
    const origin = this.origin;
    if (invdirx >= 0) {
      tmin = (box.min.x - origin.x) * invdirx;
      tmax = (box.max.x - origin.x) * invdirx;
    } else {
      tmin = (box.max.x - origin.x) * invdirx;
      tmax = (box.min.x - origin.x) * invdirx;
    }
    if (invdiry >= 0) {
      tymin = (box.min.y - origin.y) * invdiry;
      tymax = (box.max.y - origin.y) * invdiry;
    } else {
      tymin = (box.max.y - origin.y) * invdiry;
      tymax = (box.min.y - origin.y) * invdiry;
    }
    if (tmin > tymax || tymin > tmax) return null;
    if (tymin > tmin || isNaN(tmin)) tmin = tymin;
    if (tymax < tmax || isNaN(tmax)) tmax = tymax;
    if (invdirz >= 0) {
      tzmin = (box.min.z - origin.z) * invdirz;
      tzmax = (box.max.z - origin.z) * invdirz;
    } else {
      tzmin = (box.max.z - origin.z) * invdirz;
      tzmax = (box.min.z - origin.z) * invdirz;
    }
    if (tmin > tzmax || tzmin > tmax) return null;
    if (tzmin > tmin || tmin !== tmin) tmin = tzmin;
    if (tzmax < tmax || tmax !== tmax) tmax = tzmax;
    if (tmax < 0) return null;
    return this.at(tmin >= 0 ? tmin : tmax, target);
  }
  /**
   * Returns `true` if this ray intersects with the given box.
   *
   * @param {Box3} box - The box to intersect.
   * @return {boolean} Whether this ray intersects with the given box or not.
   */
  intersectsBox(box) {
    return this.intersectBox(box, _vector$a) !== null;
  }
  /**
   * Intersects this ray with the given triangle, returning the intersection
   * point or `null` if there is no intersection.
   *
   * @param {Vector3} a - The first vertex of the triangle.
   * @param {Vector3} b - The second vertex of the triangle.
   * @param {Vector3} c - The third vertex of the triangle.
   * @param {boolean} backfaceCulling - Whether to use backface culling or not.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The intersection point.
   */
  intersectTriangle(a2, b2, c2, backfaceCulling, target) {
    _edge1.subVectors(b2, a2);
    _edge2.subVectors(c2, a2);
    _normal$1.crossVectors(_edge1, _edge2);
    let DdN = this.direction.dot(_normal$1);
    let sign;
    if (DdN > 0) {
      if (backfaceCulling) return null;
      sign = 1;
    } else if (DdN < 0) {
      sign = -1;
      DdN = -DdN;
    } else {
      return null;
    }
    _diff.subVectors(this.origin, a2);
    const DdQxE2 = sign * this.direction.dot(_edge2.crossVectors(_diff, _edge2));
    if (DdQxE2 < 0) {
      return null;
    }
    const DdE1xQ = sign * this.direction.dot(_edge1.cross(_diff));
    if (DdE1xQ < 0) {
      return null;
    }
    if (DdQxE2 + DdE1xQ > DdN) {
      return null;
    }
    const QdN = -sign * _diff.dot(_normal$1);
    if (QdN < 0) {
      return null;
    }
    return this.at(QdN / DdN, target);
  }
  /**
   * Transforms this ray with the given 4x4 transformation matrix.
   *
   * @param {Matrix4} matrix4 - The transformation matrix.
   * @return {Ray} A reference to this ray.
   */
  applyMatrix4(matrix4) {
    this.origin.applyMatrix4(matrix4);
    this.direction.transformDirection(matrix4);
    return this;
  }
  /**
   * Returns `true` if this ray is equal with the given one.
   *
   * @param {Ray} ray - The ray to test for equality.
   * @return {boolean} Whether this ray is equal with the given one.
   */
  equals(ray) {
    return ray.origin.equals(this.origin) && ray.direction.equals(this.direction);
  }
  /**
   * Returns a new ray with copied values from this instance.
   *
   * @return {Ray} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
}
class Matrix4 {
  /**
   * Constructs a new 4x4 matrix. The arguments are supposed to be
   * in row-major order. If no arguments are provided, the constructor
   * initializes the matrix as an identity matrix.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n14] - 1-4 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n24] - 2-4 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @param {number} [n34] - 3-4 matrix element.
   * @param {number} [n41] - 4-1 matrix element.
   * @param {number} [n42] - 4-2 matrix element.
   * @param {number} [n43] - 4-3 matrix element.
   * @param {number} [n44] - 4-4 matrix element.
   */
  constructor(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    Matrix4.prototype.isMatrix4 = true;
    this.elements = [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ];
    if (n11 !== void 0) {
      this.set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44);
    }
  }
  /**
   * Sets the elements of the matrix.The arguments are supposed to be
   * in row-major order.
   *
   * @param {number} [n11] - 1-1 matrix element.
   * @param {number} [n12] - 1-2 matrix element.
   * @param {number} [n13] - 1-3 matrix element.
   * @param {number} [n14] - 1-4 matrix element.
   * @param {number} [n21] - 2-1 matrix element.
   * @param {number} [n22] - 2-2 matrix element.
   * @param {number} [n23] - 2-3 matrix element.
   * @param {number} [n24] - 2-4 matrix element.
   * @param {number} [n31] - 3-1 matrix element.
   * @param {number} [n32] - 3-2 matrix element.
   * @param {number} [n33] - 3-3 matrix element.
   * @param {number} [n34] - 3-4 matrix element.
   * @param {number} [n41] - 4-1 matrix element.
   * @param {number} [n42] - 4-2 matrix element.
   * @param {number} [n43] - 4-3 matrix element.
   * @param {number} [n44] - 4-4 matrix element.
   * @return {Matrix4} A reference to this matrix.
   */
  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    const te = this.elements;
    te[0] = n11;
    te[4] = n12;
    te[8] = n13;
    te[12] = n14;
    te[1] = n21;
    te[5] = n22;
    te[9] = n23;
    te[13] = n24;
    te[2] = n31;
    te[6] = n32;
    te[10] = n33;
    te[14] = n34;
    te[3] = n41;
    te[7] = n42;
    te[11] = n43;
    te[15] = n44;
    return this;
  }
  /**
   * Sets this matrix to the 4x4 identity matrix.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  identity() {
    this.set(
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Returns a matrix with copied values from this instance.
   *
   * @return {Matrix4} A clone of this instance.
   */
  clone() {
    return new Matrix4().fromArray(this.elements);
  }
  /**
   * Copies the values of the given matrix to this instance.
   *
   * @param {Matrix4} m - The matrix to copy.
   * @return {Matrix4} A reference to this matrix.
   */
  copy(m) {
    const te = this.elements;
    const me = m.elements;
    te[0] = me[0];
    te[1] = me[1];
    te[2] = me[2];
    te[3] = me[3];
    te[4] = me[4];
    te[5] = me[5];
    te[6] = me[6];
    te[7] = me[7];
    te[8] = me[8];
    te[9] = me[9];
    te[10] = me[10];
    te[11] = me[11];
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    te[15] = me[15];
    return this;
  }
  /**
   * Copies the translation component of the given matrix
   * into this matrix's translation component.
   *
   * @param {Matrix4} m - The matrix to copy the translation component.
   * @return {Matrix4} A reference to this matrix.
   */
  copyPosition(m) {
    const te = this.elements, me = m.elements;
    te[12] = me[12];
    te[13] = me[13];
    te[14] = me[14];
    return this;
  }
  /**
   * Set the upper 3x3 elements of this matrix to the values of given 3x3 matrix.
   *
   * @param {Matrix3} m - The 3x3 matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  setFromMatrix3(m) {
    const me = m.elements;
    this.set(
      me[0],
      me[3],
      me[6],
      0,
      me[1],
      me[4],
      me[7],
      0,
      me[2],
      me[5],
      me[8],
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Extracts the basis of this matrix into the three axis vectors provided.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrixColumn(this, 0);
    yAxis.setFromMatrixColumn(this, 1);
    zAxis.setFromMatrixColumn(this, 2);
    return this;
  }
  /**
   * Sets the given basis vectors to this matrix.
   *
   * @param {Vector3} xAxis - The basis's x axis.
   * @param {Vector3} yAxis - The basis's y axis.
   * @param {Vector3} zAxis - The basis's z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeBasis(xAxis, yAxis, zAxis) {
    this.set(
      xAxis.x,
      yAxis.x,
      zAxis.x,
      0,
      xAxis.y,
      yAxis.y,
      zAxis.y,
      0,
      xAxis.z,
      yAxis.z,
      zAxis.z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Extracts the rotation component of the given matrix
   * into this matrix's rotation component.
   *
   * Note: This method does not support reflection matrices.
   *
   * @param {Matrix4} m - The matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  extractRotation(m) {
    const te = this.elements;
    const me = m.elements;
    const scaleX = 1 / _v1$5.setFromMatrixColumn(m, 0).length();
    const scaleY = 1 / _v1$5.setFromMatrixColumn(m, 1).length();
    const scaleZ = 1 / _v1$5.setFromMatrixColumn(m, 2).length();
    te[0] = me[0] * scaleX;
    te[1] = me[1] * scaleX;
    te[2] = me[2] * scaleX;
    te[3] = 0;
    te[4] = me[4] * scaleY;
    te[5] = me[5] * scaleY;
    te[6] = me[6] * scaleY;
    te[7] = 0;
    te[8] = me[8] * scaleZ;
    te[9] = me[9] * scaleZ;
    te[10] = me[10] * scaleZ;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Sets the rotation component (the upper left 3x3 matrix) of this matrix to
   * the rotation specified by the given Euler angles. The rest of
   * the matrix is set to the identity. Depending on the {@link Euler#order},
   * there are six possible outcomes. See [this page](https://en.wikipedia.org/wiki/Euler_angles#Rotation_matrix)
   * for a complete list.
   *
   * @param {Euler} euler - The Euler angles.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationFromEuler(euler) {
    const te = this.elements;
    const x = euler.x, y = euler.y, z = euler.z;
    const a2 = Math.cos(x), b2 = Math.sin(x);
    const c2 = Math.cos(y), d2 = Math.sin(y);
    const e2 = Math.cos(z), f2 = Math.sin(z);
    if (euler.order === "XYZ") {
      const ae = a2 * e2, af = a2 * f2, be = b2 * e2, bf = b2 * f2;
      te[0] = c2 * e2;
      te[4] = -c2 * f2;
      te[8] = d2;
      te[1] = af + be * d2;
      te[5] = ae - bf * d2;
      te[9] = -b2 * c2;
      te[2] = bf - ae * d2;
      te[6] = be + af * d2;
      te[10] = a2 * c2;
    } else if (euler.order === "YXZ") {
      const ce = c2 * e2, cf = c2 * f2, de = d2 * e2, df = d2 * f2;
      te[0] = ce + df * b2;
      te[4] = de * b2 - cf;
      te[8] = a2 * d2;
      te[1] = a2 * f2;
      te[5] = a2 * e2;
      te[9] = -b2;
      te[2] = cf * b2 - de;
      te[6] = df + ce * b2;
      te[10] = a2 * c2;
    } else if (euler.order === "ZXY") {
      const ce = c2 * e2, cf = c2 * f2, de = d2 * e2, df = d2 * f2;
      te[0] = ce - df * b2;
      te[4] = -a2 * f2;
      te[8] = de + cf * b2;
      te[1] = cf + de * b2;
      te[5] = a2 * e2;
      te[9] = df - ce * b2;
      te[2] = -a2 * d2;
      te[6] = b2;
      te[10] = a2 * c2;
    } else if (euler.order === "ZYX") {
      const ae = a2 * e2, af = a2 * f2, be = b2 * e2, bf = b2 * f2;
      te[0] = c2 * e2;
      te[4] = be * d2 - af;
      te[8] = ae * d2 + bf;
      te[1] = c2 * f2;
      te[5] = bf * d2 + ae;
      te[9] = af * d2 - be;
      te[2] = -d2;
      te[6] = b2 * c2;
      te[10] = a2 * c2;
    } else if (euler.order === "YZX") {
      const ac = a2 * c2, ad = a2 * d2, bc = b2 * c2, bd = b2 * d2;
      te[0] = c2 * e2;
      te[4] = bd - ac * f2;
      te[8] = bc * f2 + ad;
      te[1] = f2;
      te[5] = a2 * e2;
      te[9] = -b2 * e2;
      te[2] = -d2 * e2;
      te[6] = ad * f2 + bc;
      te[10] = ac - bd * f2;
    } else if (euler.order === "XZY") {
      const ac = a2 * c2, ad = a2 * d2, bc = b2 * c2, bd = b2 * d2;
      te[0] = c2 * e2;
      te[4] = -f2;
      te[8] = d2 * e2;
      te[1] = ac * f2 + bd;
      te[5] = a2 * e2;
      te[9] = ad * f2 - bc;
      te[2] = bc * f2 - ad;
      te[6] = b2 * e2;
      te[10] = bd * f2 + ac;
    }
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Sets the rotation component of this matrix to the rotation specified by
   * the given Quaternion as outlined [here](https://en.wikipedia.org/wiki/Rotation_matrix#Quaternion)
   * The rest of the matrix is set to the identity.
   *
   * @param {Quaternion} q - The Quaternion.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationFromQuaternion(q) {
    return this.compose(_zero, q, _one);
  }
  /**
   * Sets the rotation component of the transformation matrix, looking from `eye` towards
   * `target`, and oriented by the up-direction.
   *
   * @param {Vector3} eye - The eye vector.
   * @param {Vector3} target - The target vector.
   * @param {Vector3} up - The up vector.
   * @return {Matrix4} A reference to this matrix.
   */
  lookAt(eye, target, up) {
    const te = this.elements;
    _z.subVectors(eye, target);
    if (_z.lengthSq() === 0) {
      _z.z = 1;
    }
    _z.normalize();
    _x.crossVectors(up, _z);
    if (_x.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) {
        _z.x += 1e-4;
      } else {
        _z.z += 1e-4;
      }
      _z.normalize();
      _x.crossVectors(up, _z);
    }
    _x.normalize();
    _y.crossVectors(_z, _x);
    te[0] = _x.x;
    te[4] = _y.x;
    te[8] = _z.x;
    te[1] = _x.y;
    te[5] = _y.y;
    te[9] = _z.y;
    te[2] = _x.z;
    te[6] = _y.z;
    te[10] = _z.z;
    return this;
  }
  /**
   * Post-multiplies this matrix by the given 4x4 matrix.
   *
   * @param {Matrix4} m - The matrix to multiply with.
   * @return {Matrix4} A reference to this matrix.
   */
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  /**
   * Pre-multiplies this matrix by the given 4x4 matrix.
   *
   * @param {Matrix4} m - The matrix to multiply with.
   * @return {Matrix4} A reference to this matrix.
   */
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  /**
   * Multiples the given 4x4 matrices and stores the result
   * in this matrix.
   *
   * @param {Matrix4} a - The first matrix.
   * @param {Matrix4} b - The second matrix.
   * @return {Matrix4} A reference to this matrix.
   */
  multiplyMatrices(a2, b2) {
    const ae = a2.elements;
    const be = b2.elements;
    const te = this.elements;
    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }
  /**
   * Multiplies every component of the matrix by the given scalar.
   *
   * @param {number} s - The scalar.
   * @return {Matrix4} A reference to this matrix.
   */
  multiplyScalar(s2) {
    const te = this.elements;
    te[0] *= s2;
    te[4] *= s2;
    te[8] *= s2;
    te[12] *= s2;
    te[1] *= s2;
    te[5] *= s2;
    te[9] *= s2;
    te[13] *= s2;
    te[2] *= s2;
    te[6] *= s2;
    te[10] *= s2;
    te[14] *= s2;
    te[3] *= s2;
    te[7] *= s2;
    te[11] *= s2;
    te[15] *= s2;
    return this;
  }
  /**
   * Computes and returns the determinant of this matrix.
   *
   * Based on the method outlined [here](http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.html).
   *
   * @return {number} The determinant.
   */
  determinant() {
    const te = this.elements;
    const n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12];
    const n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13];
    const n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14];
    const n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15];
    return n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) + n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) + n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) + n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31);
  }
  /**
   * Transposes this matrix in place.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  transpose() {
    const te = this.elements;
    let tmp;
    tmp = te[1];
    te[1] = te[4];
    te[4] = tmp;
    tmp = te[2];
    te[2] = te[8];
    te[8] = tmp;
    tmp = te[6];
    te[6] = te[9];
    te[9] = tmp;
    tmp = te[3];
    te[3] = te[12];
    te[12] = tmp;
    tmp = te[7];
    te[7] = te[13];
    te[13] = tmp;
    tmp = te[11];
    te[11] = te[14];
    te[14] = tmp;
    return this;
  }
  /**
   * Sets the position component for this matrix from the given vector,
   * without affecting the rest of the matrix.
   *
   * @param {number|Vector3} x - The x component of the vector or alternatively the vector object.
   * @param {number} y - The y component of the vector.
   * @param {number} z - The z component of the vector.
   * @return {Matrix4} A reference to this matrix.
   */
  setPosition(x, y, z) {
    const te = this.elements;
    if (x.isVector3) {
      te[12] = x.x;
      te[13] = x.y;
      te[14] = x.z;
    } else {
      te[12] = x;
      te[13] = y;
      te[14] = z;
    }
    return this;
  }
  /**
   * Inverts this matrix, using the [analytic method](https://en.wikipedia.org/wiki/Invertible_matrix#Analytic_solution).
   * You can not invert with a determinant of zero. If you attempt this, the method produces
   * a zero matrix instead.
   *
   * @return {Matrix4} A reference to this matrix.
   */
  invert() {
    const te = this.elements, n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3], n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7], n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11], n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15], t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44, t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44, t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44, t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const detInv = 1 / det;
    te[0] = t11 * detInv;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;
    te[4] = t12 * detInv;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;
    te[8] = t13 * detInv;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;
    te[12] = t14 * detInv;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
    return this;
  }
  /**
   * Multiplies the columns of this matrix by the given vector.
   *
   * @param {Vector3} v - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  scale(v) {
    const te = this.elements;
    const x = v.x, y = v.y, z = v.z;
    te[0] *= x;
    te[4] *= y;
    te[8] *= z;
    te[1] *= x;
    te[5] *= y;
    te[9] *= z;
    te[2] *= x;
    te[6] *= y;
    te[10] *= z;
    te[3] *= x;
    te[7] *= y;
    te[11] *= z;
    return this;
  }
  /**
   * Gets the maximum scale value of the three axes.
   *
   * @return {number} The maximum scale.
   */
  getMaxScaleOnAxis() {
    const te = this.elements;
    const scaleXSq = te[0] * te[0] + te[1] * te[1] + te[2] * te[2];
    const scaleYSq = te[4] * te[4] + te[5] * te[5] + te[6] * te[6];
    const scaleZSq = te[8] * te[8] + te[9] * te[9] + te[10] * te[10];
    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }
  /**
   * Sets this matrix as a translation transform from the given vector.
   *
   * @param {number|Vector3} x - The amount to translate in the X axis or alternatively a translation vector.
   * @param {number} y - The amount to translate in the Y axis.
   * @param {number} z - The amount to translate in the z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeTranslation(x, y, z) {
    if (x.isVector3) {
      this.set(
        1,
        0,
        0,
        x.x,
        0,
        1,
        0,
        x.y,
        0,
        0,
        1,
        x.z,
        0,
        0,
        0,
        1
      );
    } else {
      this.set(
        1,
        0,
        0,
        x,
        0,
        1,
        0,
        y,
        0,
        0,
        1,
        z,
        0,
        0,
        0,
        1
      );
    }
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the X axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationX(theta) {
    const c2 = Math.cos(theta), s2 = Math.sin(theta);
    this.set(
      1,
      0,
      0,
      0,
      0,
      c2,
      -s2,
      0,
      0,
      s2,
      c2,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the Y axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationY(theta) {
    const c2 = Math.cos(theta), s2 = Math.sin(theta);
    this.set(
      c2,
      0,
      s2,
      0,
      0,
      1,
      0,
      0,
      -s2,
      0,
      c2,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the Z axis by
   * the given angle.
   *
   * @param {number} theta - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationZ(theta) {
    const c2 = Math.cos(theta), s2 = Math.sin(theta);
    this.set(
      c2,
      -s2,
      0,
      0,
      s2,
      c2,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a rotational transformation around the given axis by
   * the given angle.
   *
   * This is a somewhat controversial but mathematically sound alternative to
   * rotating via Quaternions. See the discussion [here](https://www.gamedev.net/articles/programming/math-and-physics/do-we-really-need-quaternions-r1199).
   *
   * @param {Vector3} axis - The normalized rotation axis.
   * @param {number} angle - The rotation in radians.
   * @return {Matrix4} A reference to this matrix.
   */
  makeRotationAxis(axis, angle) {
    const c2 = Math.cos(angle);
    const s2 = Math.sin(angle);
    const t2 = 1 - c2;
    const x = axis.x, y = axis.y, z = axis.z;
    const tx = t2 * x, ty = t2 * y;
    this.set(
      tx * x + c2,
      tx * y - s2 * z,
      tx * z + s2 * y,
      0,
      tx * y + s2 * z,
      ty * y + c2,
      ty * z - s2 * x,
      0,
      tx * z - s2 * y,
      ty * z + s2 * x,
      t2 * z * z + c2,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a scale transformation.
   *
   * @param {number} x - The amount to scale in the X axis.
   * @param {number} y - The amount to scale in the Y axis.
   * @param {number} z - The amount to scale in the Z axis.
   * @return {Matrix4} A reference to this matrix.
   */
  makeScale(x, y, z) {
    this.set(
      x,
      0,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      0,
      z,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix as a shear transformation.
   *
   * @param {number} xy - The amount to shear X by Y.
   * @param {number} xz - The amount to shear X by Z.
   * @param {number} yx - The amount to shear Y by X.
   * @param {number} yz - The amount to shear Y by Z.
   * @param {number} zx - The amount to shear Z by X.
   * @param {number} zy - The amount to shear Z by Y.
   * @return {Matrix4} A reference to this matrix.
   */
  makeShear(xy, xz, yx, yz, zx, zy) {
    this.set(
      1,
      yx,
      zx,
      0,
      xy,
      1,
      zy,
      0,
      xz,
      yz,
      1,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  }
  /**
   * Sets this matrix to the transformation composed of the given position,
   * rotation (Quaternion) and scale.
   *
   * @param {Vector3} position - The position vector.
   * @param {Quaternion} quaternion - The rotation as a Quaternion.
   * @param {Vector3} scale - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  compose(position, quaternion, scale) {
    const te = this.elements;
    const x = quaternion._x, y = quaternion._y, z = quaternion._z, w = quaternion._w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scale.x, sy = scale.y, sz = scale.z;
    te[0] = (1 - (yy + zz)) * sx;
    te[1] = (xy + wz) * sx;
    te[2] = (xz - wy) * sx;
    te[3] = 0;
    te[4] = (xy - wz) * sy;
    te[5] = (1 - (xx + zz)) * sy;
    te[6] = (yz + wx) * sy;
    te[7] = 0;
    te[8] = (xz + wy) * sz;
    te[9] = (yz - wx) * sz;
    te[10] = (1 - (xx + yy)) * sz;
    te[11] = 0;
    te[12] = position.x;
    te[13] = position.y;
    te[14] = position.z;
    te[15] = 1;
    return this;
  }
  /**
   * Decomposes this matrix into its position, rotation and scale components
   * and provides the result in the given objects.
   *
   * Note: Not all matrices are decomposable in this way. For example, if an
   * object has a non-uniformly scaled parent, then the object's world matrix
   * may not be decomposable, and this method may not be appropriate.
   *
   * @param {Vector3} position - The position vector.
   * @param {Quaternion} quaternion - The rotation as a Quaternion.
   * @param {Vector3} scale - The scale vector.
   * @return {Matrix4} A reference to this matrix.
   */
  decompose(position, quaternion, scale) {
    const te = this.elements;
    let sx = _v1$5.set(te[0], te[1], te[2]).length();
    const sy = _v1$5.set(te[4], te[5], te[6]).length();
    const sz = _v1$5.set(te[8], te[9], te[10]).length();
    const det = this.determinant();
    if (det < 0) sx = -sx;
    position.x = te[12];
    position.y = te[13];
    position.z = te[14];
    _m1$2.copy(this);
    const invSX = 1 / sx;
    const invSY = 1 / sy;
    const invSZ = 1 / sz;
    _m1$2.elements[0] *= invSX;
    _m1$2.elements[1] *= invSX;
    _m1$2.elements[2] *= invSX;
    _m1$2.elements[4] *= invSY;
    _m1$2.elements[5] *= invSY;
    _m1$2.elements[6] *= invSY;
    _m1$2.elements[8] *= invSZ;
    _m1$2.elements[9] *= invSZ;
    _m1$2.elements[10] *= invSZ;
    quaternion.setFromRotationMatrix(_m1$2);
    scale.x = sx;
    scale.y = sy;
    scale.z = sz;
    return this;
  }
  /**
  	 * Creates a perspective projection matrix. This is used internally by
  	 * {@link PerspectiveCamera#updateProjectionMatrix}.
  
  	 * @param {number} left - Left boundary of the viewing frustum at the near plane.
  	 * @param {number} right - Right boundary of the viewing frustum at the near plane.
  	 * @param {number} top - Top boundary of the viewing frustum at the near plane.
  	 * @param {number} bottom - Bottom boundary of the viewing frustum at the near plane.
  	 * @param {number} near - The distance from the camera to the near plane.
  	 * @param {number} far - The distance from the camera to the far plane.
  	 * @param {(WebGLCoordinateSystem|WebGPUCoordinateSystem)} [coordinateSystem=WebGLCoordinateSystem] - The coordinate system.
  	 * @param {boolean} [reversedDepth=false] - Whether to use a reversed depth.
  	 * @return {Matrix4} A reference to this matrix.
  	 */
  makePerspective(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem, reversedDepth = false) {
    const te = this.elements;
    const x = 2 * near / (right - left);
    const y = 2 * near / (top - bottom);
    const a2 = (right + left) / (right - left);
    const b2 = (top + bottom) / (top - bottom);
    let c2, d2;
    if (reversedDepth) {
      c2 = near / (far - near);
      d2 = far * near / (far - near);
    } else {
      if (coordinateSystem === WebGLCoordinateSystem) {
        c2 = -(far + near) / (far - near);
        d2 = -2 * far * near / (far - near);
      } else if (coordinateSystem === WebGPUCoordinateSystem) {
        c2 = -far / (far - near);
        d2 = -far * near / (far - near);
      } else {
        throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: " + coordinateSystem);
      }
    }
    te[0] = x;
    te[4] = 0;
    te[8] = a2;
    te[12] = 0;
    te[1] = 0;
    te[5] = y;
    te[9] = b2;
    te[13] = 0;
    te[2] = 0;
    te[6] = 0;
    te[10] = c2;
    te[14] = d2;
    te[3] = 0;
    te[7] = 0;
    te[11] = -1;
    te[15] = 0;
    return this;
  }
  /**
  	 * Creates a orthographic projection matrix. This is used internally by
  	 * {@link OrthographicCamera#updateProjectionMatrix}.
  
  	 * @param {number} left - Left boundary of the viewing frustum at the near plane.
  	 * @param {number} right - Right boundary of the viewing frustum at the near plane.
  	 * @param {number} top - Top boundary of the viewing frustum at the near plane.
  	 * @param {number} bottom - Bottom boundary of the viewing frustum at the near plane.
  	 * @param {number} near - The distance from the camera to the near plane.
  	 * @param {number} far - The distance from the camera to the far plane.
  	 * @param {(WebGLCoordinateSystem|WebGPUCoordinateSystem)} [coordinateSystem=WebGLCoordinateSystem] - The coordinate system.
  	 * @param {boolean} [reversedDepth=false] - Whether to use a reversed depth.
  	 * @return {Matrix4} A reference to this matrix.
  	 */
  makeOrthographic(left, right, top, bottom, near, far, coordinateSystem = WebGLCoordinateSystem, reversedDepth = false) {
    const te = this.elements;
    const x = 2 / (right - left);
    const y = 2 / (top - bottom);
    const a2 = -(right + left) / (right - left);
    const b2 = -(top + bottom) / (top - bottom);
    let c2, d2;
    if (reversedDepth) {
      c2 = 1 / (far - near);
      d2 = far / (far - near);
    } else {
      if (coordinateSystem === WebGLCoordinateSystem) {
        c2 = -2 / (far - near);
        d2 = -(far + near) / (far - near);
      } else if (coordinateSystem === WebGPUCoordinateSystem) {
        c2 = -1 / (far - near);
        d2 = -near / (far - near);
      } else {
        throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: " + coordinateSystem);
      }
    }
    te[0] = x;
    te[4] = 0;
    te[8] = 0;
    te[12] = a2;
    te[1] = 0;
    te[5] = y;
    te[9] = 0;
    te[13] = b2;
    te[2] = 0;
    te[6] = 0;
    te[10] = c2;
    te[14] = d2;
    te[3] = 0;
    te[7] = 0;
    te[11] = 0;
    te[15] = 1;
    return this;
  }
  /**
   * Returns `true` if this matrix is equal with the given one.
   *
   * @param {Matrix4} matrix - The matrix to test for equality.
   * @return {boolean} Whether this matrix is equal with the given one.
   */
  equals(matrix) {
    const te = this.elements;
    const me = matrix.elements;
    for (let i = 0; i < 16; i++) {
      if (te[i] !== me[i]) return false;
    }
    return true;
  }
  /**
   * Sets the elements of the matrix from the given array.
   *
   * @param {Array<number>} array - The matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Matrix4} A reference to this matrix.
   */
  fromArray(array, offset = 0) {
    for (let i = 0; i < 16; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }
  /**
   * Writes the elements of this matrix to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the matrix elements in column-major order.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The matrix elements in column-major order.
   */
  toArray(array = [], offset = 0) {
    const te = this.elements;
    array[offset] = te[0];
    array[offset + 1] = te[1];
    array[offset + 2] = te[2];
    array[offset + 3] = te[3];
    array[offset + 4] = te[4];
    array[offset + 5] = te[5];
    array[offset + 6] = te[6];
    array[offset + 7] = te[7];
    array[offset + 8] = te[8];
    array[offset + 9] = te[9];
    array[offset + 10] = te[10];
    array[offset + 11] = te[11];
    array[offset + 12] = te[12];
    array[offset + 13] = te[13];
    array[offset + 14] = te[14];
    array[offset + 15] = te[15];
    return array;
  }
}
const _v1$5 = /* @__PURE__ */ new Vector3();
const _m1$2 = /* @__PURE__ */ new Matrix4();
const _zero = /* @__PURE__ */ new Vector3(0, 0, 0);
const _one = /* @__PURE__ */ new Vector3(1, 1, 1);
const _x = /* @__PURE__ */ new Vector3();
const _y = /* @__PURE__ */ new Vector3();
const _z = /* @__PURE__ */ new Vector3();
const _matrix$2 = /* @__PURE__ */ new Matrix4();
const _quaternion$3 = /* @__PURE__ */ new Quaternion();
class Euler {
  /**
   * Constructs a new euler instance.
   *
   * @param {number} [x=0] - The angle of the x axis in radians.
   * @param {number} [y=0] - The angle of the y axis in radians.
   * @param {number} [z=0] - The angle of the z axis in radians.
   * @param {string} [order=Euler.DEFAULT_ORDER] - A string representing the order that the rotations are applied.
   */
  constructor(x = 0, y = 0, z = 0, order = Euler.DEFAULT_ORDER) {
    this.isEuler = true;
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
  }
  /**
   * The angle of the x axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get x() {
    return this._x;
  }
  set x(value) {
    this._x = value;
    this._onChangeCallback();
  }
  /**
   * The angle of the y axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get y() {
    return this._y;
  }
  set y(value) {
    this._y = value;
    this._onChangeCallback();
  }
  /**
   * The angle of the z axis in radians.
   *
   * @type {number}
   * @default 0
   */
  get z() {
    return this._z;
  }
  set z(value) {
    this._z = value;
    this._onChangeCallback();
  }
  /**
   * A string representing the order that the rotations are applied.
   *
   * @type {string}
   * @default 'XYZ'
   */
  get order() {
    return this._order;
  }
  set order(value) {
    this._order = value;
    this._onChangeCallback();
  }
  /**
   * Sets the Euler components.
   *
   * @param {number} x - The angle of the x axis in radians.
   * @param {number} y - The angle of the y axis in radians.
   * @param {number} z - The angle of the z axis in radians.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  set(x, y, z, order = this._order) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
    this._onChangeCallback();
    return this;
  }
  /**
   * Returns a new Euler instance with copied values from this instance.
   *
   * @return {Euler} A clone of this instance.
   */
  clone() {
    return new this.constructor(this._x, this._y, this._z, this._order);
  }
  /**
   * Copies the values of the given Euler instance to this instance.
   *
   * @param {Euler} euler - The Euler instance to copy.
   * @return {Euler} A reference to this Euler instance.
   */
  copy(euler) {
    this._x = euler._x;
    this._y = euler._y;
    this._z = euler._z;
    this._order = euler._order;
    this._onChangeCallback();
    return this;
  }
  /**
   * Sets the angles of this Euler instance from a pure rotation matrix.
   *
   * @param {Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromRotationMatrix(m, order = this._order, update = true) {
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8];
    const m21 = te[1], m22 = te[5], m23 = te[9];
    const m31 = te[2], m32 = te[6], m33 = te[10];
    switch (order) {
      case "XYZ":
        this._y = Math.asin(clamp(m13, -1, 1));
        if (Math.abs(m13) < 0.9999999) {
          this._x = Math.atan2(-m23, m33);
          this._z = Math.atan2(-m12, m11);
        } else {
          this._x = Math.atan2(m32, m22);
          this._z = 0;
        }
        break;
      case "YXZ":
        this._x = Math.asin(-clamp(m23, -1, 1));
        if (Math.abs(m23) < 0.9999999) {
          this._y = Math.atan2(m13, m33);
          this._z = Math.atan2(m21, m22);
        } else {
          this._y = Math.atan2(-m31, m11);
          this._z = 0;
        }
        break;
      case "ZXY":
        this._x = Math.asin(clamp(m32, -1, 1));
        if (Math.abs(m32) < 0.9999999) {
          this._y = Math.atan2(-m31, m33);
          this._z = Math.atan2(-m12, m22);
        } else {
          this._y = 0;
          this._z = Math.atan2(m21, m11);
        }
        break;
      case "ZYX":
        this._y = Math.asin(-clamp(m31, -1, 1));
        if (Math.abs(m31) < 0.9999999) {
          this._x = Math.atan2(m32, m33);
          this._z = Math.atan2(m21, m11);
        } else {
          this._x = 0;
          this._z = Math.atan2(-m12, m22);
        }
        break;
      case "YZX":
        this._z = Math.asin(clamp(m21, -1, 1));
        if (Math.abs(m21) < 0.9999999) {
          this._x = Math.atan2(-m23, m22);
          this._y = Math.atan2(-m31, m11);
        } else {
          this._x = 0;
          this._y = Math.atan2(m13, m33);
        }
        break;
      case "XZY":
        this._z = Math.asin(-clamp(m12, -1, 1));
        if (Math.abs(m12) < 0.9999999) {
          this._x = Math.atan2(m32, m22);
          this._y = Math.atan2(m13, m11);
        } else {
          this._x = Math.atan2(-m23, m33);
          this._y = 0;
        }
        break;
      default:
        warn("Euler: .setFromRotationMatrix() encountered an unknown order: " + order);
    }
    this._order = order;
    if (update === true) this._onChangeCallback();
    return this;
  }
  /**
   * Sets the angles of this Euler instance from a normalized quaternion.
   *
   * @param {Quaternion} q - A normalized Quaternion.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @param {boolean} [update=true] - Whether the internal `onChange` callback should be executed or not.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromQuaternion(q, order, update) {
    _matrix$2.makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(_matrix$2, order, update);
  }
  /**
   * Sets the angles of this Euler instance from the given vector.
   *
   * @param {Vector3} v - The vector.
   * @param {string} [order] - A string representing the order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  setFromVector3(v, order = this._order) {
    return this.set(v.x, v.y, v.z, order);
  }
  /**
   * Resets the euler angle with a new order by creating a quaternion from this
   * euler angle and then setting this euler angle with the quaternion and the
   * new order.
   *
   * Warning: This discards revolution information.
   *
   * @param {string} [newOrder] - A string representing the new order that the rotations are applied.
   * @return {Euler} A reference to this Euler instance.
   */
  reorder(newOrder) {
    _quaternion$3.setFromEuler(this);
    return this.setFromQuaternion(_quaternion$3, newOrder);
  }
  /**
   * Returns `true` if this Euler instance is equal with the given one.
   *
   * @param {Euler} euler - The Euler instance to test for equality.
   * @return {boolean} Whether this Euler instance is equal with the given one.
   */
  equals(euler) {
    return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
  }
  /**
   * Sets this Euler instance's components to values from the given array. The first three
   * entries of the array are assign to the x,y and z components. An optional fourth entry
   * defines the Euler order.
   *
   * @param {Array<number,number,number,?string>} array - An array holding the Euler component values.
   * @return {Euler} A reference to this Euler instance.
   */
  fromArray(array) {
    this._x = array[0];
    this._y = array[1];
    this._z = array[2];
    if (array[3] !== void 0) this._order = array[3];
    this._onChangeCallback();
    return this;
  }
  /**
   * Writes the components of this Euler instance to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number,number,number,string>} [array=[]] - The target array holding the Euler components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number,number,number,string>} The Euler components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;
    return array;
  }
  _onChange(callback) {
    this._onChangeCallback = callback;
    return this;
  }
  _onChangeCallback() {
  }
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._order;
  }
}
Euler.DEFAULT_ORDER = "XYZ";
class Layers {
  /**
   * Constructs a new layers instance, with membership
   * initially set to layer `0`.
   */
  constructor() {
    this.mask = 1 | 0;
  }
  /**
   * Sets membership to the given layer, and remove membership all other layers.
   *
   * @param {number} layer - The layer to set.
   */
  set(layer) {
    this.mask = (1 << layer | 0) >>> 0;
  }
  /**
   * Adds membership of the given layer.
   *
   * @param {number} layer - The layer to enable.
   */
  enable(layer) {
    this.mask |= 1 << layer | 0;
  }
  /**
   * Adds membership to all layers.
   */
  enableAll() {
    this.mask = 4294967295 | 0;
  }
  /**
   * Toggles the membership of the given layer.
   *
   * @param {number} layer - The layer to toggle.
   */
  toggle(layer) {
    this.mask ^= 1 << layer | 0;
  }
  /**
   * Removes membership of the given layer.
   *
   * @param {number} layer - The layer to enable.
   */
  disable(layer) {
    this.mask &= ~(1 << layer | 0);
  }
  /**
   * Removes the membership from all layers.
   */
  disableAll() {
    this.mask = 0;
  }
  /**
   * Returns `true` if this and the given layers object have at least one
   * layer in common.
   *
   * @param {Layers} layers - The layers to test.
   * @return {boolean } Whether this and the given layers object have at least one layer in common or not.
   */
  test(layers) {
    return (this.mask & layers.mask) !== 0;
  }
  /**
   * Returns `true` if the given layer is enabled.
   *
   * @param {number} layer - The layer to test.
   * @return {boolean } Whether the given layer is enabled or not.
   */
  isEnabled(layer) {
    return (this.mask & (1 << layer | 0)) !== 0;
  }
}
let _object3DId = 0;
const _v1$4 = /* @__PURE__ */ new Vector3();
const _q1 = /* @__PURE__ */ new Quaternion();
const _m1$1 = /* @__PURE__ */ new Matrix4();
const _target = /* @__PURE__ */ new Vector3();
const _position$3 = /* @__PURE__ */ new Vector3();
const _scale$2 = /* @__PURE__ */ new Vector3();
const _quaternion$2 = /* @__PURE__ */ new Quaternion();
const _xAxis = /* @__PURE__ */ new Vector3(1, 0, 0);
const _yAxis = /* @__PURE__ */ new Vector3(0, 1, 0);
const _zAxis = /* @__PURE__ */ new Vector3(0, 0, 1);
const _addedEvent = { type: "added" };
const _removedEvent = { type: "removed" };
const _childaddedEvent = { type: "childadded", child: null };
const _childremovedEvent = { type: "childremoved", child: null };
class Object3D extends EventDispatcher {
  /**
   * Constructs a new 3D object.
   */
  constructor() {
    super();
    this.isObject3D = true;
    Object.defineProperty(this, "id", { value: _object3DId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "Object3D";
    this.parent = null;
    this.children = [];
    this.up = Object3D.DEFAULT_UP.clone();
    const position = new Vector3();
    const rotation = new Euler();
    const quaternion = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    function onRotationChange() {
      quaternion.setFromEuler(rotation, false);
    }
    function onQuaternionChange() {
      rotation.setFromQuaternion(quaternion, void 0, false);
    }
    rotation._onChange(onRotationChange);
    quaternion._onChange(onQuaternionChange);
    Object.defineProperties(this, {
      /**
       * Represents the object's local position.
       *
       * @name Object3D#position
       * @type {Vector3}
       * @default (0,0,0)
       */
      position: {
        configurable: true,
        enumerable: true,
        value: position
      },
      /**
       * Represents the object's local rotation as Euler angles, in radians.
       *
       * @name Object3D#rotation
       * @type {Euler}
       * @default (0,0,0)
       */
      rotation: {
        configurable: true,
        enumerable: true,
        value: rotation
      },
      /**
       * Represents the object's local rotation as Quaternions.
       *
       * @name Object3D#quaternion
       * @type {Quaternion}
       */
      quaternion: {
        configurable: true,
        enumerable: true,
        value: quaternion
      },
      /**
       * Represents the object's local scale.
       *
       * @name Object3D#scale
       * @type {Vector3}
       * @default (1,1,1)
       */
      scale: {
        configurable: true,
        enumerable: true,
        value: scale
      },
      /**
       * Represents the object's model-view matrix.
       *
       * @name Object3D#modelViewMatrix
       * @type {Matrix4}
       */
      modelViewMatrix: {
        value: new Matrix4()
      },
      /**
       * Represents the object's normal matrix.
       *
       * @name Object3D#normalMatrix
       * @type {Matrix3}
       */
      normalMatrix: {
        value: new Matrix3()
      }
    });
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
    this.matrixAutoUpdate = Object3D.DEFAULT_MATRIX_AUTO_UPDATE;
    this.matrixWorldAutoUpdate = Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE;
    this.matrixWorldNeedsUpdate = false;
    this.layers = new Layers();
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.animations = [];
    this.customDepthMaterial = void 0;
    this.customDistanceMaterial = void 0;
    this.userData = {};
  }
  /**
   * A callback that is executed immediately before a 3D object is rendered to a shadow map.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {Camera} shadowCamera - The shadow camera.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} depthMaterial - The depth material.
   * @param {Object} group - The geometry group data.
   */
  onBeforeShadow() {
  }
  /**
   * A callback that is executed immediately after a 3D object is rendered to a shadow map.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {Camera} shadowCamera - The shadow camera.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} depthMaterial - The depth material.
   * @param {Object} group - The geometry group data.
   */
  onAfterShadow() {
  }
  /**
   * A callback that is executed immediately before a 3D object is rendered.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} material - The 3D object's material.
   * @param {Object} group - The geometry group data.
   */
  onBeforeRender() {
  }
  /**
   * A callback that is executed immediately after a 3D object is rendered.
   *
   * @param {Renderer|WebGLRenderer} renderer - The renderer.
   * @param {Object3D} object - The 3D object.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Material} material - The 3D object's material.
   * @param {Object} group - The geometry group data.
   */
  onAfterRender() {
  }
  /**
   * Applies the given transformation matrix to the object and updates the object's position,
   * rotation and scale.
   *
   * @param {Matrix4} matrix - The transformation matrix.
   */
  applyMatrix4(matrix) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    this.matrix.premultiply(matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }
  /**
   * Applies a rotation represented by given the quaternion to the 3D object.
   *
   * @param {Quaternion} q - The quaternion.
   * @return {Object3D} A reference to this instance.
   */
  applyQuaternion(q) {
    this.quaternion.premultiply(q);
    return this;
  }
  /**
   * Sets the given rotation represented as an axis/angle couple to the 3D object.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   */
  setRotationFromAxisAngle(axis, angle) {
    this.quaternion.setFromAxisAngle(axis, angle);
  }
  /**
   * Sets the given rotation represented as Euler angles to the 3D object.
   *
   * @param {Euler} euler - The Euler angles.
   */
  setRotationFromEuler(euler) {
    this.quaternion.setFromEuler(euler, true);
  }
  /**
   * Sets the given rotation represented as rotation matrix to the 3D object.
   *
   * @param {Matrix4} m - Although a 4x4 matrix is expected, the upper 3x3 portion must be
   * a pure rotation matrix (i.e, unscaled).
   */
  setRotationFromMatrix(m) {
    this.quaternion.setFromRotationMatrix(m);
  }
  /**
   * Sets the given rotation represented as a Quaternion to the 3D object.
   *
   * @param {Quaternion} q - The Quaternion
   */
  setRotationFromQuaternion(q) {
    this.quaternion.copy(q);
  }
  /**
   * Rotates the 3D object along an axis in local space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateOnAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(_q1);
    return this;
  }
  /**
   * Rotates the 3D object along an axis in world space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateOnWorldAxis(axis, angle) {
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.premultiply(_q1);
    return this;
  }
  /**
   * Rotates the 3D object around its X axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateX(angle) {
    return this.rotateOnAxis(_xAxis, angle);
  }
  /**
   * Rotates the 3D object around its Y axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateY(angle) {
    return this.rotateOnAxis(_yAxis, angle);
  }
  /**
   * Rotates the 3D object around its Z axis in local space.
   *
   * @param {number} angle - The angle in radians.
   * @return {Object3D} A reference to this instance.
   */
  rotateZ(angle) {
    return this.rotateOnAxis(_zAxis, angle);
  }
  /**
   * Translate the 3D object by a distance along the given axis in local space.
   *
   * @param {Vector3} axis - The (normalized) axis vector.
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateOnAxis(axis, distance) {
    _v1$4.copy(axis).applyQuaternion(this.quaternion);
    this.position.add(_v1$4.multiplyScalar(distance));
    return this;
  }
  /**
   * Translate the 3D object by a distance along its X-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateX(distance) {
    return this.translateOnAxis(_xAxis, distance);
  }
  /**
   * Translate the 3D object by a distance along its Y-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateY(distance) {
    return this.translateOnAxis(_yAxis, distance);
  }
  /**
   * Translate the 3D object by a distance along its Z-axis in local space.
   *
   * @param {number} distance - The distance in world units.
   * @return {Object3D} A reference to this instance.
   */
  translateZ(distance) {
    return this.translateOnAxis(_zAxis, distance);
  }
  /**
   * Converts the given vector from this 3D object's local space to world space.
   *
   * @param {Vector3} vector - The vector to convert.
   * @return {Vector3} The converted vector.
   */
  localToWorld(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(this.matrixWorld);
  }
  /**
   * Converts the given vector from this 3D object's word space to local space.
   *
   * @param {Vector3} vector - The vector to convert.
   * @return {Vector3} The converted vector.
   */
  worldToLocal(vector) {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(_m1$1.copy(this.matrixWorld).invert());
  }
  /**
   * Rotates the object to face a point in world space.
   *
   * This method does not support objects having non-uniformly-scaled parent(s).
   *
   * @param {number|Vector3} x - The x coordinate in world space. Alternatively, a vector representing a position in world space
   * @param {number} [y] - The y coordinate in world space.
   * @param {number} [z] - The z coordinate in world space.
   */
  lookAt(x, y, z) {
    if (x.isVector3) {
      _target.copy(x);
    } else {
      _target.set(x, y, z);
    }
    const parent = this.parent;
    this.updateWorldMatrix(true, false);
    _position$3.setFromMatrixPosition(this.matrixWorld);
    if (this.isCamera || this.isLight) {
      _m1$1.lookAt(_position$3, _target, this.up);
    } else {
      _m1$1.lookAt(_target, _position$3, this.up);
    }
    this.quaternion.setFromRotationMatrix(_m1$1);
    if (parent) {
      _m1$1.extractRotation(parent.matrixWorld);
      _q1.setFromRotationMatrix(_m1$1);
      this.quaternion.premultiply(_q1.invert());
    }
  }
  /**
   * Adds the given 3D object as a child to this 3D object. An arbitrary number of
   * objects may be added. Any current parent on an object passed in here will be
   * removed, since an object can have at most one parent.
   *
   * @fires Object3D#added
   * @fires Object3D#childadded
   * @param {Object3D} object - The 3D object to add.
   * @return {Object3D} A reference to this instance.
   */
  add(object2) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.add(arguments[i]);
      }
      return this;
    }
    if (object2 === this) {
      error("Object3D.add: object can't be added as a child of itself.", object2);
      return this;
    }
    if (object2 && object2.isObject3D) {
      object2.removeFromParent();
      object2.parent = this;
      this.children.push(object2);
      object2.dispatchEvent(_addedEvent);
      _childaddedEvent.child = object2;
      this.dispatchEvent(_childaddedEvent);
      _childaddedEvent.child = null;
    } else {
      error("Object3D.add: object not an instance of THREE.Object3D.", object2);
    }
    return this;
  }
  /**
   * Removes the given 3D object as child from this 3D object.
   * An arbitrary number of objects may be removed.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @param {Object3D} object - The 3D object to remove.
   * @return {Object3D} A reference to this instance.
   */
  remove(object2) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.remove(arguments[i]);
      }
      return this;
    }
    const index2 = this.children.indexOf(object2);
    if (index2 !== -1) {
      object2.parent = null;
      this.children.splice(index2, 1);
      object2.dispatchEvent(_removedEvent);
      _childremovedEvent.child = object2;
      this.dispatchEvent(_childremovedEvent);
      _childremovedEvent.child = null;
    }
    return this;
  }
  /**
   * Removes this 3D object from its current parent.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @return {Object3D} A reference to this instance.
   */
  removeFromParent() {
    const parent = this.parent;
    if (parent !== null) {
      parent.remove(this);
    }
    return this;
  }
  /**
   * Removes all child objects.
   *
   * @fires Object3D#removed
   * @fires Object3D#childremoved
   * @return {Object3D} A reference to this instance.
   */
  clear() {
    return this.remove(...this.children);
  }
  /**
   * Adds the given 3D object as a child of this 3D object, while maintaining the object's world
   * transform. This method does not support scene graphs having non-uniformly-scaled nodes(s).
   *
   * @fires Object3D#added
   * @fires Object3D#childadded
   * @param {Object3D} object - The 3D object to attach.
   * @return {Object3D} A reference to this instance.
   */
  attach(object2) {
    this.updateWorldMatrix(true, false);
    _m1$1.copy(this.matrixWorld).invert();
    if (object2.parent !== null) {
      object2.parent.updateWorldMatrix(true, false);
      _m1$1.multiply(object2.parent.matrixWorld);
    }
    object2.applyMatrix4(_m1$1);
    object2.removeFromParent();
    object2.parent = this;
    this.children.push(object2);
    object2.updateWorldMatrix(false, true);
    object2.dispatchEvent(_addedEvent);
    _childaddedEvent.child = object2;
    this.dispatchEvent(_childaddedEvent);
    _childaddedEvent.child = null;
    return this;
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching ID.
   *
   * @param {number} id - The id.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectById(id) {
    return this.getObjectByProperty("id", id);
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching name.
   *
   * @param {string} name - The name.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectByName(name) {
    return this.getObjectByProperty("name", name);
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns the first with a matching property value.
   *
   * @param {string} name - The name of the property.
   * @param {any} value - The value.
   * @return {Object3D|undefined} The found 3D object. Returns `undefined` if no 3D object has been found.
   */
  getObjectByProperty(name, value) {
    if (this[name] === value) return this;
    for (let i = 0, l2 = this.children.length; i < l2; i++) {
      const child = this.children[i];
      const object2 = child.getObjectByProperty(name, value);
      if (object2 !== void 0) {
        return object2;
      }
    }
    return void 0;
  }
  /**
   * Searches through the 3D object and its children, starting with the 3D object
   * itself, and returns all 3D objects with a matching property value.
   *
   * @param {string} name - The name of the property.
   * @param {any} value - The value.
   * @param {Array<Object3D>} result - The method stores the result in this array.
   * @return {Array<Object3D>} The found 3D objects.
   */
  getObjectsByProperty(name, value, result = []) {
    if (this[name] === value) result.push(this);
    const children = this.children;
    for (let i = 0, l2 = children.length; i < l2; i++) {
      children[i].getObjectsByProperty(name, value, result);
    }
    return result;
  }
  /**
   * Returns a vector representing the position of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's position in world space.
   */
  getWorldPosition(target) {
    this.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.matrixWorld);
  }
  /**
   * Returns a Quaternion representing the position of the 3D object in world space.
   *
   * @param {Quaternion} target - The target Quaternion the result is stored to.
   * @return {Quaternion} The 3D object's rotation in world space.
   */
  getWorldQuaternion(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, target, _scale$2);
    return target;
  }
  /**
   * Returns a vector representing the scale of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's scale in world space.
   */
  getWorldScale(target) {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position$3, _quaternion$2, target);
    return target;
  }
  /**
   * Returns a vector representing the ("look") direction of the 3D object in world space.
   *
   * @param {Vector3} target - The target vector the result is stored to.
   * @return {Vector3} The 3D object's direction in world space.
   */
  getWorldDirection(target) {
    this.updateWorldMatrix(true, false);
    const e2 = this.matrixWorld.elements;
    return target.set(e2[8], e2[9], e2[10]).normalize();
  }
  /**
   * Abstract method to get intersections between a casted ray and this
   * 3D object. Renderable 3D objects such as {@link Mesh}, {@link Line} or {@link Points}
   * implement this method in order to use raycasting.
   *
   * @abstract
   * @param {Raycaster} raycaster - The raycaster.
   * @param {Array<Object>} intersects - An array holding the result of the method.
   */
  raycast() {
  }
  /**
   * Executes the callback on this 3D object and all descendants.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverse(callback) {
    callback(this);
    const children = this.children;
    for (let i = 0, l2 = children.length; i < l2; i++) {
      children[i].traverse(callback);
    }
  }
  /**
   * Like {@link Object3D#traverse}, but the callback will only be executed for visible 3D objects.
   * Descendants of invisible 3D objects are not traversed.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverseVisible(callback) {
    if (this.visible === false) return;
    callback(this);
    const children = this.children;
    for (let i = 0, l2 = children.length; i < l2; i++) {
      children[i].traverseVisible(callback);
    }
  }
  /**
   * Like {@link Object3D#traverse}, but the callback will only be executed for all ancestors.
   *
   * Note: Modifying the scene graph inside the callback is discouraged.
   *
   * @param {Function} callback - A callback function that allows to process the current 3D object.
   */
  traverseAncestors(callback) {
    const parent = this.parent;
    if (parent !== null) {
      callback(parent);
      parent.traverseAncestors(callback);
    }
  }
  /**
   * Updates the transformation matrix in local space by computing it from the current
   * position, rotation and scale values.
   */
  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }
  /**
   * Updates the transformation matrix in world space of this 3D objects and its descendants.
   *
   * To ensure correct results, this method also recomputes the 3D object's transformation matrix in
   * local space. The computation of the local and world matrix can be controlled with the
   * {@link Object3D#matrixAutoUpdate} and {@link Object3D#matrixWorldAutoUpdate} flags which are both
   * `true` by default.  Set these flags to `false` if you need more control over the update matrix process.
   *
   * @param {boolean} [force=false] - When set to `true`, a recomputation of world matrices is forced even
   * when {@link Object3D#matrixWorldAutoUpdate} is set to `false`.
   */
  updateMatrixWorld(force) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) {
          this.matrixWorld.copy(this.matrix);
        } else {
          this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
        }
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l2 = children.length; i < l2; i++) {
      const child = children[i];
      child.updateMatrixWorld(force);
    }
  }
  /**
   * An alternative version of {@link Object3D#updateMatrixWorld} with more control over the
   * update of ancestor and descendant nodes.
   *
   * @param {boolean} [updateParents=false] Whether ancestor nodes should be updated or not.
   * @param {boolean} [updateChildren=false] Whether descendant nodes should be updated or not.
   */
  updateWorldMatrix(updateParents, updateChildren) {
    const parent = this.parent;
    if (updateParents === true && parent !== null) {
      parent.updateWorldMatrix(true, false);
    }
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldAutoUpdate === true) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
    }
    if (updateChildren === true) {
      const children = this.children;
      for (let i = 0, l2 = children.length; i < l2; i++) {
        const child = children[i];
        child.updateWorldMatrix(false, true);
      }
    }
  }
  /**
   * Serializes the 3D object into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized 3D object.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    const output = {};
    if (isRootObject) {
      meta = {
        geometries: {},
        materials: {},
        textures: {},
        images: {},
        shapes: {},
        skeletons: {},
        animations: {},
        nodes: {}
      };
      output.metadata = {
        version: 4.7,
        type: "Object",
        generator: "Object3D.toJSON"
      };
    }
    const object2 = {};
    object2.uuid = this.uuid;
    object2.type = this.type;
    if (this.name !== "") object2.name = this.name;
    if (this.castShadow === true) object2.castShadow = true;
    if (this.receiveShadow === true) object2.receiveShadow = true;
    if (this.visible === false) object2.visible = false;
    if (this.frustumCulled === false) object2.frustumCulled = false;
    if (this.renderOrder !== 0) object2.renderOrder = this.renderOrder;
    if (Object.keys(this.userData).length > 0) object2.userData = this.userData;
    object2.layers = this.layers.mask;
    object2.matrix = this.matrix.toArray();
    object2.up = this.up.toArray();
    if (this.matrixAutoUpdate === false) object2.matrixAutoUpdate = false;
    if (this.isInstancedMesh) {
      object2.type = "InstancedMesh";
      object2.count = this.count;
      object2.instanceMatrix = this.instanceMatrix.toJSON();
      if (this.instanceColor !== null) object2.instanceColor = this.instanceColor.toJSON();
    }
    if (this.isBatchedMesh) {
      object2.type = "BatchedMesh";
      object2.perObjectFrustumCulled = this.perObjectFrustumCulled;
      object2.sortObjects = this.sortObjects;
      object2.drawRanges = this._drawRanges;
      object2.reservedRanges = this._reservedRanges;
      object2.geometryInfo = this._geometryInfo.map((info) => ({
        ...info,
        boundingBox: info.boundingBox ? info.boundingBox.toJSON() : void 0,
        boundingSphere: info.boundingSphere ? info.boundingSphere.toJSON() : void 0
      }));
      object2.instanceInfo = this._instanceInfo.map((info) => ({ ...info }));
      object2.availableInstanceIds = this._availableInstanceIds.slice();
      object2.availableGeometryIds = this._availableGeometryIds.slice();
      object2.nextIndexStart = this._nextIndexStart;
      object2.nextVertexStart = this._nextVertexStart;
      object2.geometryCount = this._geometryCount;
      object2.maxInstanceCount = this._maxInstanceCount;
      object2.maxVertexCount = this._maxVertexCount;
      object2.maxIndexCount = this._maxIndexCount;
      object2.geometryInitialized = this._geometryInitialized;
      object2.matricesTexture = this._matricesTexture.toJSON(meta);
      object2.indirectTexture = this._indirectTexture.toJSON(meta);
      if (this._colorsTexture !== null) {
        object2.colorsTexture = this._colorsTexture.toJSON(meta);
      }
      if (this.boundingSphere !== null) {
        object2.boundingSphere = this.boundingSphere.toJSON();
      }
      if (this.boundingBox !== null) {
        object2.boundingBox = this.boundingBox.toJSON();
      }
    }
    function serialize(library, element) {
      if (library[element.uuid] === void 0) {
        library[element.uuid] = element.toJSON(meta);
      }
      return element.uuid;
    }
    if (this.isScene) {
      if (this.background) {
        if (this.background.isColor) {
          object2.background = this.background.toJSON();
        } else if (this.background.isTexture) {
          object2.background = this.background.toJSON(meta).uuid;
        }
      }
      if (this.environment && this.environment.isTexture && this.environment.isRenderTargetTexture !== true) {
        object2.environment = this.environment.toJSON(meta).uuid;
      }
    } else if (this.isMesh || this.isLine || this.isPoints) {
      object2.geometry = serialize(meta.geometries, this.geometry);
      const parameters = this.geometry.parameters;
      if (parameters !== void 0 && parameters.shapes !== void 0) {
        const shapes = parameters.shapes;
        if (Array.isArray(shapes)) {
          for (let i = 0, l2 = shapes.length; i < l2; i++) {
            const shape = shapes[i];
            serialize(meta.shapes, shape);
          }
        } else {
          serialize(meta.shapes, shapes);
        }
      }
    }
    if (this.isSkinnedMesh) {
      object2.bindMode = this.bindMode;
      object2.bindMatrix = this.bindMatrix.toArray();
      if (this.skeleton !== void 0) {
        serialize(meta.skeletons, this.skeleton);
        object2.skeleton = this.skeleton.uuid;
      }
    }
    if (this.material !== void 0) {
      if (Array.isArray(this.material)) {
        const uuids = [];
        for (let i = 0, l2 = this.material.length; i < l2; i++) {
          uuids.push(serialize(meta.materials, this.material[i]));
        }
        object2.material = uuids;
      } else {
        object2.material = serialize(meta.materials, this.material);
      }
    }
    if (this.children.length > 0) {
      object2.children = [];
      for (let i = 0; i < this.children.length; i++) {
        object2.children.push(this.children[i].toJSON(meta).object);
      }
    }
    if (this.animations.length > 0) {
      object2.animations = [];
      for (let i = 0; i < this.animations.length; i++) {
        const animation = this.animations[i];
        object2.animations.push(serialize(meta.animations, animation));
      }
    }
    if (isRootObject) {
      const geometries = extractFromCache(meta.geometries);
      const materials = extractFromCache(meta.materials);
      const textures = extractFromCache(meta.textures);
      const images = extractFromCache(meta.images);
      const shapes = extractFromCache(meta.shapes);
      const skeletons = extractFromCache(meta.skeletons);
      const animations = extractFromCache(meta.animations);
      const nodes = extractFromCache(meta.nodes);
      if (geometries.length > 0) output.geometries = geometries;
      if (materials.length > 0) output.materials = materials;
      if (textures.length > 0) output.textures = textures;
      if (images.length > 0) output.images = images;
      if (shapes.length > 0) output.shapes = shapes;
      if (skeletons.length > 0) output.skeletons = skeletons;
      if (animations.length > 0) output.animations = animations;
      if (nodes.length > 0) output.nodes = nodes;
    }
    output.object = object2;
    return output;
    function extractFromCache(cache) {
      const values = [];
      for (const key in cache) {
        const data = cache[key];
        delete data.metadata;
        values.push(data);
      }
      return values;
    }
  }
  /**
   * Returns a new 3D object with copied values from this instance.
   *
   * @param {boolean} [recursive=true] - When set to `true`, descendants of the 3D object are also cloned.
   * @return {Object3D} A clone of this instance.
   */
  clone(recursive) {
    return new this.constructor().copy(this, recursive);
  }
  /**
   * Copies the values of the given 3D object to this instance.
   *
   * @param {Object3D} source - The 3D object to copy.
   * @param {boolean} [recursive=true] - When set to `true`, descendants of the 3D object are cloned.
   * @return {Object3D} A reference to this instance.
   */
  copy(source, recursive = true) {
    this.name = source.name;
    this.up.copy(source.up);
    this.position.copy(source.position);
    this.rotation.order = source.rotation.order;
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);
    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);
    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
    this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;
    this.layers.mask = source.layers.mask;
    this.visible = source.visible;
    this.castShadow = source.castShadow;
    this.receiveShadow = source.receiveShadow;
    this.frustumCulled = source.frustumCulled;
    this.renderOrder = source.renderOrder;
    this.animations = source.animations.slice();
    this.userData = JSON.parse(JSON.stringify(source.userData));
    if (recursive === true) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i];
        this.add(child.clone());
      }
    }
    return this;
  }
}
Object3D.DEFAULT_UP = /* @__PURE__ */ new Vector3(0, 1, 0);
Object3D.DEFAULT_MATRIX_AUTO_UPDATE = true;
Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE = true;
const _v0$1 = /* @__PURE__ */ new Vector3();
const _v1$3 = /* @__PURE__ */ new Vector3();
const _v2$2 = /* @__PURE__ */ new Vector3();
const _v3$2 = /* @__PURE__ */ new Vector3();
const _vab = /* @__PURE__ */ new Vector3();
const _vac = /* @__PURE__ */ new Vector3();
const _vbc = /* @__PURE__ */ new Vector3();
const _vap = /* @__PURE__ */ new Vector3();
const _vbp = /* @__PURE__ */ new Vector3();
const _vcp = /* @__PURE__ */ new Vector3();
const _v40 = /* @__PURE__ */ new Vector4();
const _v41 = /* @__PURE__ */ new Vector4();
const _v42 = /* @__PURE__ */ new Vector4();
class Triangle {
  /**
   * Constructs a new triangle.
   *
   * @param {Vector3} [a=(0,0,0)] - The first corner of the triangle.
   * @param {Vector3} [b=(0,0,0)] - The second corner of the triangle.
   * @param {Vector3} [c=(0,0,0)] - The third corner of the triangle.
   */
  constructor(a2 = new Vector3(), b2 = new Vector3(), c2 = new Vector3()) {
    this.a = a2;
    this.b = b2;
    this.c = c2;
  }
  /**
   * Computes the normal vector of a triangle.
   *
   * @param {Vector3} a - The first corner of the triangle.
   * @param {Vector3} b - The second corner of the triangle.
   * @param {Vector3} c - The third corner of the triangle.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The triangle's normal.
   */
  static getNormal(a2, b2, c2, target) {
    target.subVectors(c2, b2);
    _v0$1.subVectors(a2, b2);
    target.cross(_v0$1);
    const targetLengthSq = target.lengthSq();
    if (targetLengthSq > 0) {
      return target.multiplyScalar(1 / Math.sqrt(targetLengthSq));
    }
    return target.set(0, 0, 0);
  }
  /**
   * Computes a barycentric coordinates from the given vector.
   * Returns `null` if the triangle is degenerate.
   *
   * @param {Vector3} point - A point in 3D space.
   * @param {Vector3} a - The first corner of the triangle.
   * @param {Vector3} b - The second corner of the triangle.
   * @param {Vector3} c - The third corner of the triangle.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The barycentric coordinates for the given point
   */
  static getBarycoord(point, a2, b2, c2, target) {
    _v0$1.subVectors(c2, a2);
    _v1$3.subVectors(b2, a2);
    _v2$2.subVectors(point, a2);
    const dot00 = _v0$1.dot(_v0$1);
    const dot01 = _v0$1.dot(_v1$3);
    const dot02 = _v0$1.dot(_v2$2);
    const dot11 = _v1$3.dot(_v1$3);
    const dot12 = _v1$3.dot(_v2$2);
    const denom = dot00 * dot11 - dot01 * dot01;
    if (denom === 0) {
      target.set(0, 0, 0);
      return null;
    }
    const invDenom = 1 / denom;
    const u2 = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    return target.set(1 - u2 - v, v, u2);
  }
  /**
   * Returns `true` if the given point, when projected onto the plane of the
   * triangle, lies within the triangle.
   *
   * @param {Vector3} point - The point in 3D space to test.
   * @param {Vector3} a - The first corner of the triangle.
   * @param {Vector3} b - The second corner of the triangle.
   * @param {Vector3} c - The third corner of the triangle.
   * @return {boolean} Whether the given point, when projected onto the plane of the
   * triangle, lies within the triangle or not.
   */
  static containsPoint(point, a2, b2, c2) {
    if (this.getBarycoord(point, a2, b2, c2, _v3$2) === null) {
      return false;
    }
    return _v3$2.x >= 0 && _v3$2.y >= 0 && _v3$2.x + _v3$2.y <= 1;
  }
  /**
   * Computes the value barycentrically interpolated for the given point on the
   * triangle. Returns `null` if the triangle is degenerate.
   *
   * @param {Vector3} point - Position of interpolated point.
   * @param {Vector3} p1 - The first corner of the triangle.
   * @param {Vector3} p2 - The second corner of the triangle.
   * @param {Vector3} p3 - The third corner of the triangle.
   * @param {Vector3} v1 - Value to interpolate of first vertex.
   * @param {Vector3} v2 - Value to interpolate of second vertex.
   * @param {Vector3} v3 - Value to interpolate of third vertex.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The interpolated value.
   */
  static getInterpolation(point, p1, p2, p3, v1, v2, v3, target) {
    if (this.getBarycoord(point, p1, p2, p3, _v3$2) === null) {
      target.x = 0;
      target.y = 0;
      if ("z" in target) target.z = 0;
      if ("w" in target) target.w = 0;
      return null;
    }
    target.setScalar(0);
    target.addScaledVector(v1, _v3$2.x);
    target.addScaledVector(v2, _v3$2.y);
    target.addScaledVector(v3, _v3$2.z);
    return target;
  }
  /**
   * Computes the value barycentrically interpolated for the given attribute and indices.
   *
   * @param {BufferAttribute} attr - The attribute to interpolate.
   * @param {number} i1 - Index of first vertex.
   * @param {number} i2 - Index of second vertex.
   * @param {number} i3 - Index of third vertex.
   * @param {Vector3} barycoord - The barycoordinate value to use to interpolate.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The interpolated attribute value.
   */
  static getInterpolatedAttribute(attr, i1, i2, i3, barycoord, target) {
    _v40.setScalar(0);
    _v41.setScalar(0);
    _v42.setScalar(0);
    _v40.fromBufferAttribute(attr, i1);
    _v41.fromBufferAttribute(attr, i2);
    _v42.fromBufferAttribute(attr, i3);
    target.setScalar(0);
    target.addScaledVector(_v40, barycoord.x);
    target.addScaledVector(_v41, barycoord.y);
    target.addScaledVector(_v42, barycoord.z);
    return target;
  }
  /**
   * Returns `true` if the triangle is oriented towards the given direction.
   *
   * @param {Vector3} a - The first corner of the triangle.
   * @param {Vector3} b - The second corner of the triangle.
   * @param {Vector3} c - The third corner of the triangle.
   * @param {Vector3} direction - The (normalized) direction vector.
   * @return {boolean} Whether the triangle is oriented towards the given direction or not.
   */
  static isFrontFacing(a2, b2, c2, direction) {
    _v0$1.subVectors(c2, b2);
    _v1$3.subVectors(a2, b2);
    return _v0$1.cross(_v1$3).dot(direction) < 0 ? true : false;
  }
  /**
   * Sets the triangle's vertices by copying the given values.
   *
   * @param {Vector3} a - The first corner of the triangle.
   * @param {Vector3} b - The second corner of the triangle.
   * @param {Vector3} c - The third corner of the triangle.
   * @return {Triangle} A reference to this triangle.
   */
  set(a2, b2, c2) {
    this.a.copy(a2);
    this.b.copy(b2);
    this.c.copy(c2);
    return this;
  }
  /**
   * Sets the triangle's vertices by copying the given array values.
   *
   * @param {Array<Vector3>} points - An array with 3D points.
   * @param {number} i0 - The array index representing the first corner of the triangle.
   * @param {number} i1 - The array index representing the second corner of the triangle.
   * @param {number} i2 - The array index representing the third corner of the triangle.
   * @return {Triangle} A reference to this triangle.
   */
  setFromPointsAndIndices(points, i0, i1, i2) {
    this.a.copy(points[i0]);
    this.b.copy(points[i1]);
    this.c.copy(points[i2]);
    return this;
  }
  /**
   * Sets the triangle's vertices by copying the given attribute values.
   *
   * @param {BufferAttribute} attribute - A buffer attribute with 3D points data.
   * @param {number} i0 - The attribute index representing the first corner of the triangle.
   * @param {number} i1 - The attribute index representing the second corner of the triangle.
   * @param {number} i2 - The attribute index representing the third corner of the triangle.
   * @return {Triangle} A reference to this triangle.
   */
  setFromAttributeAndIndices(attribute, i0, i1, i2) {
    this.a.fromBufferAttribute(attribute, i0);
    this.b.fromBufferAttribute(attribute, i1);
    this.c.fromBufferAttribute(attribute, i2);
    return this;
  }
  /**
   * Returns a new triangle with copied values from this instance.
   *
   * @return {Triangle} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given triangle to this instance.
   *
   * @param {Triangle} triangle - The triangle to copy.
   * @return {Triangle} A reference to this triangle.
   */
  copy(triangle) {
    this.a.copy(triangle.a);
    this.b.copy(triangle.b);
    this.c.copy(triangle.c);
    return this;
  }
  /**
   * Computes the area of the triangle.
   *
   * @return {number} The triangle's area.
   */
  getArea() {
    _v0$1.subVectors(this.c, this.b);
    _v1$3.subVectors(this.a, this.b);
    return _v0$1.cross(_v1$3).length() * 0.5;
  }
  /**
   * Computes the midpoint of the triangle.
   *
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The triangle's midpoint.
   */
  getMidpoint(target) {
    return target.addVectors(this.a, this.b).add(this.c).multiplyScalar(1 / 3);
  }
  /**
   * Computes the normal of the triangle.
   *
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The triangle's normal.
   */
  getNormal(target) {
    return Triangle.getNormal(this.a, this.b, this.c, target);
  }
  /**
   * Computes a plane the triangle lies within.
   *
   * @param {Plane} target - The target vector that is used to store the method's result.
   * @return {Plane} The plane the triangle lies within.
   */
  getPlane(target) {
    return target.setFromCoplanarPoints(this.a, this.b, this.c);
  }
  /**
   * Computes a barycentric coordinates from the given vector.
   * Returns `null` if the triangle is degenerate.
   *
   * @param {Vector3} point - A point in 3D space.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The barycentric coordinates for the given point
   */
  getBarycoord(point, target) {
    return Triangle.getBarycoord(point, this.a, this.b, this.c, target);
  }
  /**
   * Computes the value barycentrically interpolated for the given point on the
   * triangle. Returns `null` if the triangle is degenerate.
   *
   * @param {Vector3} point - Position of interpolated point.
   * @param {Vector3} v1 - Value to interpolate of first vertex.
   * @param {Vector3} v2 - Value to interpolate of second vertex.
   * @param {Vector3} v3 - Value to interpolate of third vertex.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {?Vector3} The interpolated value.
   */
  getInterpolation(point, v1, v2, v3, target) {
    return Triangle.getInterpolation(point, this.a, this.b, this.c, v1, v2, v3, target);
  }
  /**
   * Returns `true` if the given point, when projected onto the plane of the
   * triangle, lies within the triangle.
   *
   * @param {Vector3} point - The point in 3D space to test.
   * @return {boolean} Whether the given point, when projected onto the plane of the
   * triangle, lies within the triangle or not.
   */
  containsPoint(point) {
    return Triangle.containsPoint(point, this.a, this.b, this.c);
  }
  /**
   * Returns `true` if the triangle is oriented towards the given direction.
   *
   * @param {Vector3} direction - The (normalized) direction vector.
   * @return {boolean} Whether the triangle is oriented towards the given direction or not.
   */
  isFrontFacing(direction) {
    return Triangle.isFrontFacing(this.a, this.b, this.c, direction);
  }
  /**
   * Returns `true` if this triangle intersects with the given box.
   *
   * @param {Box3} box - The box to intersect.
   * @return {boolean} Whether this triangle intersects with the given box or not.
   */
  intersectsBox(box) {
    return box.intersectsTriangle(this);
  }
  /**
   * Returns the closest point on the triangle to the given point.
   *
   * @param {Vector3} p - The point to compute the closest point for.
   * @param {Vector3} target - The target vector that is used to store the method's result.
   * @return {Vector3} The closest point on the triangle.
   */
  closestPointToPoint(p, target) {
    const a2 = this.a, b2 = this.b, c2 = this.c;
    let v, w;
    _vab.subVectors(b2, a2);
    _vac.subVectors(c2, a2);
    _vap.subVectors(p, a2);
    const d1 = _vab.dot(_vap);
    const d2 = _vac.dot(_vap);
    if (d1 <= 0 && d2 <= 0) {
      return target.copy(a2);
    }
    _vbp.subVectors(p, b2);
    const d3 = _vab.dot(_vbp);
    const d4 = _vac.dot(_vbp);
    if (d3 >= 0 && d4 <= d3) {
      return target.copy(b2);
    }
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      v = d1 / (d1 - d3);
      return target.copy(a2).addScaledVector(_vab, v);
    }
    _vcp.subVectors(p, c2);
    const d5 = _vab.dot(_vcp);
    const d6 = _vac.dot(_vcp);
    if (d6 >= 0 && d5 <= d6) {
      return target.copy(c2);
    }
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      w = d2 / (d2 - d6);
      return target.copy(a2).addScaledVector(_vac, w);
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      _vbc.subVectors(c2, b2);
      w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      return target.copy(b2).addScaledVector(_vbc, w);
    }
    const denom = 1 / (va + vb + vc);
    v = vb * denom;
    w = vc * denom;
    return target.copy(a2).addScaledVector(_vab, v).addScaledVector(_vac, w);
  }
  /**
   * Returns `true` if this triangle is equal with the given one.
   *
   * @param {Triangle} triangle - The triangle to test for equality.
   * @return {boolean} Whether this triangle is equal with the given one.
   */
  equals(triangle) {
    return triangle.a.equals(this.a) && triangle.b.equals(this.b) && triangle.c.equals(this.c);
  }
}
const _colorKeywords = {
  "aliceblue": 15792383,
  "antiquewhite": 16444375,
  "aqua": 65535,
  "aquamarine": 8388564,
  "azure": 15794175,
  "beige": 16119260,
  "bisque": 16770244,
  "black": 0,
  "blanchedalmond": 16772045,
  "blue": 255,
  "blueviolet": 9055202,
  "brown": 10824234,
  "burlywood": 14596231,
  "cadetblue": 6266528,
  "chartreuse": 8388352,
  "chocolate": 13789470,
  "coral": 16744272,
  "cornflowerblue": 6591981,
  "cornsilk": 16775388,
  "crimson": 14423100,
  "cyan": 65535,
  "darkblue": 139,
  "darkcyan": 35723,
  "darkgoldenrod": 12092939,
  "darkgray": 11119017,
  "darkgreen": 25600,
  "darkgrey": 11119017,
  "darkkhaki": 12433259,
  "darkmagenta": 9109643,
  "darkolivegreen": 5597999,
  "darkorange": 16747520,
  "darkorchid": 10040012,
  "darkred": 9109504,
  "darksalmon": 15308410,
  "darkseagreen": 9419919,
  "darkslateblue": 4734347,
  "darkslategray": 3100495,
  "darkslategrey": 3100495,
  "darkturquoise": 52945,
  "darkviolet": 9699539,
  "deeppink": 16716947,
  "deepskyblue": 49151,
  "dimgray": 6908265,
  "dimgrey": 6908265,
  "dodgerblue": 2003199,
  "firebrick": 11674146,
  "floralwhite": 16775920,
  "forestgreen": 2263842,
  "fuchsia": 16711935,
  "gainsboro": 14474460,
  "ghostwhite": 16316671,
  "gold": 16766720,
  "goldenrod": 14329120,
  "gray": 8421504,
  "green": 32768,
  "greenyellow": 11403055,
  "grey": 8421504,
  "honeydew": 15794160,
  "hotpink": 16738740,
  "indianred": 13458524,
  "indigo": 4915330,
  "ivory": 16777200,
  "khaki": 15787660,
  "lavender": 15132410,
  "lavenderblush": 16773365,
  "lawngreen": 8190976,
  "lemonchiffon": 16775885,
  "lightblue": 11393254,
  "lightcoral": 15761536,
  "lightcyan": 14745599,
  "lightgoldenrodyellow": 16448210,
  "lightgray": 13882323,
  "lightgreen": 9498256,
  "lightgrey": 13882323,
  "lightpink": 16758465,
  "lightsalmon": 16752762,
  "lightseagreen": 2142890,
  "lightskyblue": 8900346,
  "lightslategray": 7833753,
  "lightslategrey": 7833753,
  "lightsteelblue": 11584734,
  "lightyellow": 16777184,
  "lime": 65280,
  "limegreen": 3329330,
  "linen": 16445670,
  "magenta": 16711935,
  "maroon": 8388608,
  "mediumaquamarine": 6737322,
  "mediumblue": 205,
  "mediumorchid": 12211667,
  "mediumpurple": 9662683,
  "mediumseagreen": 3978097,
  "mediumslateblue": 8087790,
  "mediumspringgreen": 64154,
  "mediumturquoise": 4772300,
  "mediumvioletred": 13047173,
  "midnightblue": 1644912,
  "mintcream": 16121850,
  "mistyrose": 16770273,
  "moccasin": 16770229,
  "navajowhite": 16768685,
  "navy": 128,
  "oldlace": 16643558,
  "olive": 8421376,
  "olivedrab": 7048739,
  "orange": 16753920,
  "orangered": 16729344,
  "orchid": 14315734,
  "palegoldenrod": 15657130,
  "palegreen": 10025880,
  "paleturquoise": 11529966,
  "palevioletred": 14381203,
  "papayawhip": 16773077,
  "peachpuff": 16767673,
  "peru": 13468991,
  "pink": 16761035,
  "plum": 14524637,
  "powderblue": 11591910,
  "purple": 8388736,
  "rebeccapurple": 6697881,
  "red": 16711680,
  "rosybrown": 12357519,
  "royalblue": 4286945,
  "saddlebrown": 9127187,
  "salmon": 16416882,
  "sandybrown": 16032864,
  "seagreen": 3050327,
  "seashell": 16774638,
  "sienna": 10506797,
  "silver": 12632256,
  "skyblue": 8900331,
  "slateblue": 6970061,
  "slategray": 7372944,
  "slategrey": 7372944,
  "snow": 16775930,
  "springgreen": 65407,
  "steelblue": 4620980,
  "tan": 13808780,
  "teal": 32896,
  "thistle": 14204888,
  "tomato": 16737095,
  "turquoise": 4251856,
  "violet": 15631086,
  "wheat": 16113331,
  "white": 16777215,
  "whitesmoke": 16119285,
  "yellow": 16776960,
  "yellowgreen": 10145074
};
const _hslA = { h: 0, s: 0, l: 0 };
const _hslB = { h: 0, s: 0, l: 0 };
function hue2rgb(p, q, t2) {
  if (t2 < 0) t2 += 1;
  if (t2 > 1) t2 -= 1;
  if (t2 < 1 / 6) return p + (q - p) * 6 * t2;
  if (t2 < 1 / 2) return q;
  if (t2 < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t2);
  return p;
}
class Color {
  /**
   * Constructs a new color.
   *
   * Note that standard method of specifying color in three.js is with a hexadecimal triplet,
   * and that method is used throughout the rest of the documentation.
   *
   * @param {(number|string|Color)} [r] - The red component of the color. If `g` and `b` are
   * not provided, it can be hexadecimal triplet, a CSS-style string or another `Color` instance.
   * @param {number} [g] - The green component.
   * @param {number} [b] - The blue component.
   */
  constructor(r2, g, b2) {
    this.isColor = true;
    this.r = 1;
    this.g = 1;
    this.b = 1;
    return this.set(r2, g, b2);
  }
  /**
   * Sets the colors's components from the given values.
   *
   * @param {(number|string|Color)} [r] - The red component of the color. If `g` and `b` are
   * not provided, it can be hexadecimal triplet, a CSS-style string or another `Color` instance.
   * @param {number} [g] - The green component.
   * @param {number} [b] - The blue component.
   * @return {Color} A reference to this color.
   */
  set(r2, g, b2) {
    if (g === void 0 && b2 === void 0) {
      const value = r2;
      if (value && value.isColor) {
        this.copy(value);
      } else if (typeof value === "number") {
        this.setHex(value);
      } else if (typeof value === "string") {
        this.setStyle(value);
      }
    } else {
      this.setRGB(r2, g, b2);
    }
    return this;
  }
  /**
   * Sets the colors's components to the given scalar value.
   *
   * @param {number} scalar - The scalar value.
   * @return {Color} A reference to this color.
   */
  setScalar(scalar) {
    this.r = scalar;
    this.g = scalar;
    this.b = scalar;
    return this;
  }
  /**
   * Sets this color from a hexadecimal value.
   *
   * @param {number} hex - The hexadecimal value.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setHex(hex, colorSpace = SRGBColorSpace) {
    hex = Math.floor(hex);
    this.r = (hex >> 16 & 255) / 255;
    this.g = (hex >> 8 & 255) / 255;
    this.b = (hex & 255) / 255;
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from RGB values.
   *
   * @param {number} r - Red channel value between `0.0` and `1.0`.
   * @param {number} g - Green channel value between `0.0` and `1.0`.
   * @param {number} b - Blue channel value between `0.0` and `1.0`.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setRGB(r2, g, b2, colorSpace = ColorManagement.workingColorSpace) {
    this.r = r2;
    this.g = g;
    this.b = b2;
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from RGB values.
   *
   * @param {number} h - Hue value between `0.0` and `1.0`.
   * @param {number} s - Saturation value between `0.0` and `1.0`.
   * @param {number} l - Lightness value between `0.0` and `1.0`.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setHSL(h2, s2, l2, colorSpace = ColorManagement.workingColorSpace) {
    h2 = euclideanModulo(h2, 1);
    s2 = clamp(s2, 0, 1);
    l2 = clamp(l2, 0, 1);
    if (s2 === 0) {
      this.r = this.g = this.b = l2;
    } else {
      const p = l2 <= 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
      const q = 2 * l2 - p;
      this.r = hue2rgb(q, p, h2 + 1 / 3);
      this.g = hue2rgb(q, p, h2);
      this.b = hue2rgb(q, p, h2 - 1 / 3);
    }
    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }
  /**
   * Sets this color from a CSS-style string. For example, `rgb(250, 0,0)`,
   * `rgb(100%, 0%, 0%)`, `hsl(0, 100%, 50%)`, `#ff0000`, `#f00`, or `red` ( or
   * any [X11 color name](https://en.wikipedia.org/wiki/X11_color_names#Color_name_chart) -
   * all 140 color names are supported).
   *
   * @param {string} style - Color as a CSS-style string.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setStyle(style, colorSpace = SRGBColorSpace) {
    function handleAlpha(string) {
      if (string === void 0) return;
      if (parseFloat(string) < 1) {
        warn("Color: Alpha component of " + style + " will be ignored.");
      }
    }
    let m;
    if (m = /^(\w+)\(([^\)]*)\)/.exec(style)) {
      let color;
      const name = m[1];
      const components = m[2];
      switch (name) {
        case "rgb":
        case "rgba":
          if (color = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(255, parseInt(color[1], 10)) / 255,
              Math.min(255, parseInt(color[2], 10)) / 255,
              Math.min(255, parseInt(color[3], 10)) / 255,
              colorSpace
            );
          }
          if (color = /^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(100, parseInt(color[1], 10)) / 100,
              Math.min(100, parseInt(color[2], 10)) / 100,
              Math.min(100, parseInt(color[3], 10)) / 100,
              colorSpace
            );
          }
          break;
        case "hsl":
        case "hsla":
          if (color = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
            handleAlpha(color[4]);
            return this.setHSL(
              parseFloat(color[1]) / 360,
              parseFloat(color[2]) / 100,
              parseFloat(color[3]) / 100,
              colorSpace
            );
          }
          break;
        default:
          warn("Color: Unknown color model " + style);
      }
    } else if (m = /^\#([A-Fa-f\d]+)$/.exec(style)) {
      const hex = m[1];
      const size = hex.length;
      if (size === 3) {
        return this.setRGB(
          parseInt(hex.charAt(0), 16) / 15,
          parseInt(hex.charAt(1), 16) / 15,
          parseInt(hex.charAt(2), 16) / 15,
          colorSpace
        );
      } else if (size === 6) {
        return this.setHex(parseInt(hex, 16), colorSpace);
      } else {
        warn("Color: Invalid hex color " + style);
      }
    } else if (style && style.length > 0) {
      return this.setColorName(style, colorSpace);
    }
    return this;
  }
  /**
   * Sets this color from a color name. Faster than {@link Color#setStyle} if
   * you don't need the other CSS-style formats.
   *
   * For convenience, the list of names is exposed in `Color.NAMES` as a hash.
   * ```js
   * Color.NAMES.aliceblue // returns 0xF0F8FF
   * ```
   *
   * @param {string} style - The color name.
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {Color} A reference to this color.
   */
  setColorName(style, colorSpace = SRGBColorSpace) {
    const hex = _colorKeywords[style.toLowerCase()];
    if (hex !== void 0) {
      this.setHex(hex, colorSpace);
    } else {
      warn("Color: Unknown color " + style);
    }
    return this;
  }
  /**
   * Returns a new color with copied values from this instance.
   *
   * @return {Color} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.r, this.g, this.b);
  }
  /**
   * Copies the values of the given color to this instance.
   *
   * @param {Color} color - The color to copy.
   * @return {Color} A reference to this color.
   */
  copy(color) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    return this;
  }
  /**
   * Copies the given color into this color, and then converts this color from
   * `SRGBColorSpace` to `LinearSRGBColorSpace`.
   *
   * @param {Color} color - The color to copy/convert.
   * @return {Color} A reference to this color.
   */
  copySRGBToLinear(color) {
    this.r = SRGBToLinear(color.r);
    this.g = SRGBToLinear(color.g);
    this.b = SRGBToLinear(color.b);
    return this;
  }
  /**
   * Copies the given color into this color, and then converts this color from
   * `LinearSRGBColorSpace` to `SRGBColorSpace`.
   *
   * @param {Color} color - The color to copy/convert.
   * @return {Color} A reference to this color.
   */
  copyLinearToSRGB(color) {
    this.r = LinearToSRGB(color.r);
    this.g = LinearToSRGB(color.g);
    this.b = LinearToSRGB(color.b);
    return this;
  }
  /**
   * Converts this color from `SRGBColorSpace` to `LinearSRGBColorSpace`.
   *
   * @return {Color} A reference to this color.
   */
  convertSRGBToLinear() {
    this.copySRGBToLinear(this);
    return this;
  }
  /**
   * Converts this color from `LinearSRGBColorSpace` to `SRGBColorSpace`.
   *
   * @return {Color} A reference to this color.
   */
  convertLinearToSRGB() {
    this.copyLinearToSRGB(this);
    return this;
  }
  /**
   * Returns the hexadecimal value of this color.
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {number} The hexadecimal value.
   */
  getHex(colorSpace = SRGBColorSpace) {
    ColorManagement.workingToColorSpace(_color$2.copy(this), colorSpace);
    return Math.round(clamp(_color$2.r * 255, 0, 255)) * 65536 + Math.round(clamp(_color$2.g * 255, 0, 255)) * 256 + Math.round(clamp(_color$2.b * 255, 0, 255));
  }
  /**
   * Returns the hexadecimal value of this color as a string (for example, 'FFFFFF').
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {string} The hexadecimal value as a string.
   */
  getHexString(colorSpace = SRGBColorSpace) {
    return ("000000" + this.getHex(colorSpace).toString(16)).slice(-6);
  }
  /**
   * Converts the colors RGB values into the HSL format and stores them into the
   * given target object.
   *
   * @param {{h:number,s:number,l:number}} target - The target object that is used to store the method's result.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {{h:number,s:number,l:number}} The HSL representation of this color.
   */
  getHSL(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.workingToColorSpace(_color$2.copy(this), colorSpace);
    const r2 = _color$2.r, g = _color$2.g, b2 = _color$2.b;
    const max = Math.max(r2, g, b2);
    const min = Math.min(r2, g, b2);
    let hue, saturation;
    const lightness = (min + max) / 2;
    if (min === max) {
      hue = 0;
      saturation = 0;
    } else {
      const delta = max - min;
      saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
      switch (max) {
        case r2:
          hue = (g - b2) / delta + (g < b2 ? 6 : 0);
          break;
        case g:
          hue = (b2 - r2) / delta + 2;
          break;
        case b2:
          hue = (r2 - g) / delta + 4;
          break;
      }
      hue /= 6;
    }
    target.h = hue;
    target.s = saturation;
    target.l = lightness;
    return target;
  }
  /**
   * Returns the RGB values of this color and stores them into the given target object.
   *
   * @param {Color} target - The target color that is used to store the method's result.
   * @param {string} [colorSpace=ColorManagement.workingColorSpace] - The color space.
   * @return {Color} The RGB representation of this color.
   */
  getRGB(target, colorSpace = ColorManagement.workingColorSpace) {
    ColorManagement.workingToColorSpace(_color$2.copy(this), colorSpace);
    target.r = _color$2.r;
    target.g = _color$2.g;
    target.b = _color$2.b;
    return target;
  }
  /**
   * Returns the value of this color as a CSS style string. Example: `rgb(255,0,0)`.
   *
   * @param {string} [colorSpace=SRGBColorSpace] - The color space.
   * @return {string} The CSS representation of this color.
   */
  getStyle(colorSpace = SRGBColorSpace) {
    ColorManagement.workingToColorSpace(_color$2.copy(this), colorSpace);
    const r2 = _color$2.r, g = _color$2.g, b2 = _color$2.b;
    if (colorSpace !== SRGBColorSpace) {
      return `color(${colorSpace} ${r2.toFixed(3)} ${g.toFixed(3)} ${b2.toFixed(3)})`;
    }
    return `rgb(${Math.round(r2 * 255)},${Math.round(g * 255)},${Math.round(b2 * 255)})`;
  }
  /**
   * Adds the given HSL values to this color's values.
   * Internally, this converts the color's RGB values to HSL, adds HSL
   * and then converts the color back to RGB.
   *
   * @param {number} h - Hue value between `0.0` and `1.0`.
   * @param {number} s - Saturation value between `0.0` and `1.0`.
   * @param {number} l - Lightness value between `0.0` and `1.0`.
   * @return {Color} A reference to this color.
   */
  offsetHSL(h2, s2, l2) {
    this.getHSL(_hslA);
    return this.setHSL(_hslA.h + h2, _hslA.s + s2, _hslA.l + l2);
  }
  /**
   * Adds the RGB values of the given color to the RGB values of this color.
   *
   * @param {Color} color - The color to add.
   * @return {Color} A reference to this color.
   */
  add(color) {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;
    return this;
  }
  /**
   * Adds the RGB values of the given colors and stores the result in this instance.
   *
   * @param {Color} color1 - The first color.
   * @param {Color} color2 - The second color.
   * @return {Color} A reference to this color.
   */
  addColors(color1, color2) {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;
    return this;
  }
  /**
   * Adds the given scalar value to the RGB values of this color.
   *
   * @param {number} s - The scalar to add.
   * @return {Color} A reference to this color.
   */
  addScalar(s2) {
    this.r += s2;
    this.g += s2;
    this.b += s2;
    return this;
  }
  /**
   * Subtracts the RGB values of the given color from the RGB values of this color.
   *
   * @param {Color} color - The color to subtract.
   * @return {Color} A reference to this color.
   */
  sub(color) {
    this.r = Math.max(0, this.r - color.r);
    this.g = Math.max(0, this.g - color.g);
    this.b = Math.max(0, this.b - color.b);
    return this;
  }
  /**
   * Multiplies the RGB values of the given color with the RGB values of this color.
   *
   * @param {Color} color - The color to multiply.
   * @return {Color} A reference to this color.
   */
  multiply(color) {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;
    return this;
  }
  /**
   * Multiplies the given scalar value with the RGB values of this color.
   *
   * @param {number} s - The scalar to multiply.
   * @return {Color} A reference to this color.
   */
  multiplyScalar(s2) {
    this.r *= s2;
    this.g *= s2;
    this.b *= s2;
    return this;
  }
  /**
   * Linearly interpolates this color's RGB values toward the RGB values of the
   * given color. The alpha argument can be thought of as the ratio between
   * the two colors, where `0.0` is this color and `1.0` is the first argument.
   *
   * @param {Color} color - The color to converge on.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerp(color, alpha) {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;
    return this;
  }
  /**
   * Linearly interpolates between the given colors and stores the result in this instance.
   * The alpha argument can be thought of as the ratio between the two colors, where `0.0`
   * is the first and `1.0` is the second color.
   *
   * @param {Color} color1 - The first color.
   * @param {Color} color2 - The second color.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerpColors(color1, color2, alpha) {
    this.r = color1.r + (color2.r - color1.r) * alpha;
    this.g = color1.g + (color2.g - color1.g) * alpha;
    this.b = color1.b + (color2.b - color1.b) * alpha;
    return this;
  }
  /**
   * Linearly interpolates this color's HSL values toward the HSL values of the
   * given color. It differs from {@link Color#lerp} by not interpolating straight
   * from one color to the other, but instead going through all the hues in between
   * those two colors. The alpha argument can be thought of as the ratio between
   * the two colors, where 0.0 is this color and 1.0 is the first argument.
   *
   * @param {Color} color - The color to converge on.
   * @param {number} alpha - The interpolation factor in the closed interval `[0,1]`.
   * @return {Color} A reference to this color.
   */
  lerpHSL(color, alpha) {
    this.getHSL(_hslA);
    color.getHSL(_hslB);
    const h2 = lerp(_hslA.h, _hslB.h, alpha);
    const s2 = lerp(_hslA.s, _hslB.s, alpha);
    const l2 = lerp(_hslA.l, _hslB.l, alpha);
    this.setHSL(h2, s2, l2);
    return this;
  }
  /**
   * Sets the color's RGB components from the given 3D vector.
   *
   * @param {Vector3} v - The vector to set.
   * @return {Color} A reference to this color.
   */
  setFromVector3(v) {
    this.r = v.x;
    this.g = v.y;
    this.b = v.z;
    return this;
  }
  /**
   * Transforms this color with the given 3x3 matrix.
   *
   * @param {Matrix3} m - The matrix.
   * @return {Color} A reference to this color.
   */
  applyMatrix3(m) {
    const r2 = this.r, g = this.g, b2 = this.b;
    const e2 = m.elements;
    this.r = e2[0] * r2 + e2[3] * g + e2[6] * b2;
    this.g = e2[1] * r2 + e2[4] * g + e2[7] * b2;
    this.b = e2[2] * r2 + e2[5] * g + e2[8] * b2;
    return this;
  }
  /**
   * Returns `true` if this color is equal with the given one.
   *
   * @param {Color} c - The color to test for equality.
   * @return {boolean} Whether this bounding color is equal with the given one.
   */
  equals(c2) {
    return c2.r === this.r && c2.g === this.g && c2.b === this.b;
  }
  /**
   * Sets this color's RGB components from the given array.
   *
   * @param {Array<number>} array - An array holding the RGB values.
   * @param {number} [offset=0] - The offset into the array.
   * @return {Color} A reference to this color.
   */
  fromArray(array, offset = 0) {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];
    return this;
  }
  /**
   * Writes the RGB components of this color to the given array. If no array is provided,
   * the method returns a new instance.
   *
   * @param {Array<number>} [array=[]] - The target array holding the color components.
   * @param {number} [offset=0] - Index of the first element in the array.
   * @return {Array<number>} The color components.
   */
  toArray(array = [], offset = 0) {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }
  /**
   * Sets the components of this color from the given buffer attribute.
   *
   * @param {BufferAttribute} attribute - The buffer attribute holding color data.
   * @param {number} index - The index into the attribute.
   * @return {Color} A reference to this color.
   */
  fromBufferAttribute(attribute, index2) {
    this.r = attribute.getX(index2);
    this.g = attribute.getY(index2);
    this.b = attribute.getZ(index2);
    return this;
  }
  /**
   * This methods defines the serialization result of this class. Returns the color
   * as a hexadecimal value.
   *
   * @return {number} The hexadecimal value.
   */
  toJSON() {
    return this.getHex();
  }
  *[Symbol.iterator]() {
    yield this.r;
    yield this.g;
    yield this.b;
  }
}
const _color$2 = /* @__PURE__ */ new Color();
Color.NAMES = _colorKeywords;
let _materialId = 0;
class Material extends EventDispatcher {
  /**
   * Constructs a new material.
   */
  constructor() {
    super();
    this.isMaterial = true;
    Object.defineProperty(this, "id", { value: _materialId++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "Material";
    this.blending = NormalBlending;
    this.side = FrontSide;
    this.vertexColors = false;
    this.opacity = 1;
    this.transparent = false;
    this.alphaHash = false;
    this.blendSrc = SrcAlphaFactor;
    this.blendDst = OneMinusSrcAlphaFactor;
    this.blendEquation = AddEquation;
    this.blendSrcAlpha = null;
    this.blendDstAlpha = null;
    this.blendEquationAlpha = null;
    this.blendColor = new Color(0, 0, 0);
    this.blendAlpha = 0;
    this.depthFunc = LessEqualDepth;
    this.depthTest = true;
    this.depthWrite = true;
    this.stencilWriteMask = 255;
    this.stencilFunc = AlwaysStencilFunc;
    this.stencilRef = 0;
    this.stencilFuncMask = 255;
    this.stencilFail = KeepStencilOp;
    this.stencilZFail = KeepStencilOp;
    this.stencilZPass = KeepStencilOp;
    this.stencilWrite = false;
    this.clippingPlanes = null;
    this.clipIntersection = false;
    this.clipShadows = false;
    this.shadowSide = null;
    this.colorWrite = true;
    this.precision = null;
    this.polygonOffset = false;
    this.polygonOffsetFactor = 0;
    this.polygonOffsetUnits = 0;
    this.dithering = false;
    this.alphaToCoverage = false;
    this.premultipliedAlpha = false;
    this.forceSinglePass = false;
    this.allowOverride = true;
    this.visible = true;
    this.toneMapped = true;
    this.userData = {};
    this.version = 0;
    this._alphaTest = 0;
  }
  /**
   * Sets the alpha value to be used when running an alpha test. The material
   * will not be rendered if the opacity is lower than this value.
   *
   * @type {number}
   * @readonly
   * @default 0
   */
  get alphaTest() {
    return this._alphaTest;
  }
  set alphaTest(value) {
    if (this._alphaTest > 0 !== value > 0) {
      this.version++;
    }
    this._alphaTest = value;
  }
  /**
   * An optional callback that is executed immediately before the material is used to render a 3D object.
   *
   * This method can only be used when rendering with {@link WebGLRenderer}.
   *
   * @param {WebGLRenderer} renderer - The renderer.
   * @param {Scene} scene - The scene.
   * @param {Camera} camera - The camera that is used to render the scene.
   * @param {BufferGeometry} geometry - The 3D object's geometry.
   * @param {Object3D} object - The 3D object.
   * @param {Object} group - The geometry group data.
   */
  onBeforeRender() {
  }
  /**
   * An optional callback that is executed immediately before the shader
   * program is compiled. This function is called with the shader source code
   * as a parameter. Useful for the modification of built-in materials.
   *
   * This method can only be used when rendering with {@link WebGLRenderer}. The
   * recommended approach when customizing materials is to use `WebGPURenderer` with the new
   * Node Material system and [TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language).
   *
   * @param {{vertexShader:string,fragmentShader:string,uniforms:Object}} shaderobject - The object holds the uniforms and the vertex and fragment shader source.
   * @param {WebGLRenderer} renderer - A reference to the renderer.
   */
  onBeforeCompile() {
  }
  /**
   * In case {@link Material#onBeforeCompile} is used, this callback can be used to identify
   * values of settings used in `onBeforeCompile()`, so three.js can reuse a cached
   * shader or recompile the shader for this material as needed.
   *
   * This method can only be used when rendering with {@link WebGLRenderer}.
   *
   * @return {string} The custom program cache key.
   */
  customProgramCacheKey() {
    return this.onBeforeCompile.toString();
  }
  /**
   * This method can be used to set default values from parameter objects.
   * It is a generic implementation so it can be used with different types
   * of materials.
   *
   * @param {Object} [values] - The material values to set.
   */
  setValues(values) {
    if (values === void 0) return;
    for (const key in values) {
      const newValue = values[key];
      if (newValue === void 0) {
        warn(`Material: parameter '${key}' has value of undefined.`);
        continue;
      }
      const currentValue = this[key];
      if (currentValue === void 0) {
        warn(`Material: '${key}' is not a property of THREE.${this.type}.`);
        continue;
      }
      if (currentValue && currentValue.isColor) {
        currentValue.set(newValue);
      } else if (currentValue && currentValue.isVector3 && (newValue && newValue.isVector3)) {
        currentValue.copy(newValue);
      } else {
        this[key] = newValue;
      }
    }
  }
  /**
   * Serializes the material into JSON.
   *
   * @param {?(Object|string)} meta - An optional value holding meta information about the serialization.
   * @return {Object} A JSON object representing the serialized material.
   * @see {@link ObjectLoader#parse}
   */
  toJSON(meta) {
    const isRootObject = meta === void 0 || typeof meta === "string";
    if (isRootObject) {
      meta = {
        textures: {},
        images: {}
      };
    }
    const data = {
      metadata: {
        version: 4.7,
        type: "Material",
        generator: "Material.toJSON"
      }
    };
    data.uuid = this.uuid;
    data.type = this.type;
    if (this.name !== "") data.name = this.name;
    if (this.color && this.color.isColor) data.color = this.color.getHex();
    if (this.roughness !== void 0) data.roughness = this.roughness;
    if (this.metalness !== void 0) data.metalness = this.metalness;
    if (this.sheen !== void 0) data.sheen = this.sheen;
    if (this.sheenColor && this.sheenColor.isColor) data.sheenColor = this.sheenColor.getHex();
    if (this.sheenRoughness !== void 0) data.sheenRoughness = this.sheenRoughness;
    if (this.emissive && this.emissive.isColor) data.emissive = this.emissive.getHex();
    if (this.emissiveIntensity !== void 0 && this.emissiveIntensity !== 1) data.emissiveIntensity = this.emissiveIntensity;
    if (this.specular && this.specular.isColor) data.specular = this.specular.getHex();
    if (this.specularIntensity !== void 0) data.specularIntensity = this.specularIntensity;
    if (this.specularColor && this.specularColor.isColor) data.specularColor = this.specularColor.getHex();
    if (this.shininess !== void 0) data.shininess = this.shininess;
    if (this.clearcoat !== void 0) data.clearcoat = this.clearcoat;
    if (this.clearcoatRoughness !== void 0) data.clearcoatRoughness = this.clearcoatRoughness;
    if (this.clearcoatMap && this.clearcoatMap.isTexture) {
      data.clearcoatMap = this.clearcoatMap.toJSON(meta).uuid;
    }
    if (this.clearcoatRoughnessMap && this.clearcoatRoughnessMap.isTexture) {
      data.clearcoatRoughnessMap = this.clearcoatRoughnessMap.toJSON(meta).uuid;
    }
    if (this.clearcoatNormalMap && this.clearcoatNormalMap.isTexture) {
      data.clearcoatNormalMap = this.clearcoatNormalMap.toJSON(meta).uuid;
      data.clearcoatNormalScale = this.clearcoatNormalScale.toArray();
    }
    if (this.sheenColorMap && this.sheenColorMap.isTexture) {
      data.sheenColorMap = this.sheenColorMap.toJSON(meta).uuid;
    }
    if (this.sheenRoughnessMap && this.sheenRoughnessMap.isTexture) {
      data.sheenRoughnessMap = this.sheenRoughnessMap.toJSON(meta).uuid;
    }
    if (this.dispersion !== void 0) data.dispersion = this.dispersion;
    if (this.iridescence !== void 0) data.iridescence = this.iridescence;
    if (this.iridescenceIOR !== void 0) data.iridescenceIOR = this.iridescenceIOR;
    if (this.iridescenceThicknessRange !== void 0) data.iridescenceThicknessRange = this.iridescenceThicknessRange;
    if (this.iridescenceMap && this.iridescenceMap.isTexture) {
      data.iridescenceMap = this.iridescenceMap.toJSON(meta).uuid;
    }
    if (this.iridescenceThicknessMap && this.iridescenceThicknessMap.isTexture) {
      data.iridescenceThicknessMap = this.iridescenceThicknessMap.toJSON(meta).uuid;
    }
    if (this.anisotropy !== void 0) data.anisotropy = this.anisotropy;
    if (this.anisotropyRotation !== void 0) data.anisotropyRotation = this.anisotropyRotation;
    if (this.anisotropyMap && this.anisotropyMap.isTexture) {
      data.anisotropyMap = this.anisotropyMap.toJSON(meta).uuid;
    }
    if (this.map && this.map.isTexture) data.map = this.map.toJSON(meta).uuid;
    if (this.matcap && this.matcap.isTexture) data.matcap = this.matcap.toJSON(meta).uuid;
    if (this.alphaMap && this.alphaMap.isTexture) data.alphaMap = this.alphaMap.toJSON(meta).uuid;
    if (this.lightMap && this.lightMap.isTexture) {
      data.lightMap = this.lightMap.toJSON(meta).uuid;
      data.lightMapIntensity = this.lightMapIntensity;
    }
    if (this.aoMap && this.aoMap.isTexture) {
      data.aoMap = this.aoMap.toJSON(meta).uuid;
      data.aoMapIntensity = this.aoMapIntensity;
    }
    if (this.bumpMap && this.bumpMap.isTexture) {
      data.bumpMap = this.bumpMap.toJSON(meta).uuid;
      data.bumpScale = this.bumpScale;
    }
    if (this.normalMap && this.normalMap.isTexture) {
      data.normalMap = this.normalMap.toJSON(meta).uuid;
      data.normalMapType = this.normalMapType;
      data.normalScale = this.normalScale.toArray();
    }
    if (this.displacementMap && this.displacementMap.isTexture) {
      data.displacementMap = this.displacementMap.toJSON(meta).uuid;
      data.displacementScale = this.displacementScale;
      data.displacementBias = this.displacementBias;
    }
    if (this.roughnessMap && this.roughnessMap.isTexture) data.roughnessMap = this.roughnessMap.toJSON(meta).uuid;
    if (this.metalnessMap && this.metalnessMap.isTexture) data.metalnessMap = this.metalnessMap.toJSON(meta).uuid;
    if (this.emissiveMap && this.emissiveMap.isTexture) data.emissiveMap = this.emissiveMap.toJSON(meta).uuid;
    if (this.specularMap && this.specularMap.isTexture) data.specularMap = this.specularMap.toJSON(meta).uuid;
    if (this.specularIntensityMap && this.specularIntensityMap.isTexture) data.specularIntensityMap = this.specularIntensityMap.toJSON(meta).uuid;
    if (this.specularColorMap && this.specularColorMap.isTexture) data.specularColorMap = this.specularColorMap.toJSON(meta).uuid;
    if (this.envMap && this.envMap.isTexture) {
      data.envMap = this.envMap.toJSON(meta).uuid;
      if (this.combine !== void 0) data.combine = this.combine;
    }
    if (this.envMapRotation !== void 0) data.envMapRotation = this.envMapRotation.toArray();
    if (this.envMapIntensity !== void 0) data.envMapIntensity = this.envMapIntensity;
    if (this.reflectivity !== void 0) data.reflectivity = this.reflectivity;
    if (this.refractionRatio !== void 0) data.refractionRatio = this.refractionRatio;
    if (this.gradientMap && this.gradientMap.isTexture) {
      data.gradientMap = this.gradientMap.toJSON(meta).uuid;
    }
    if (this.transmission !== void 0) data.transmission = this.transmission;
    if (this.transmissionMap && this.transmissionMap.isTexture) data.transmissionMap = this.transmissionMap.toJSON(meta).uuid;
    if (this.thickness !== void 0) data.thickness = this.thickness;
    if (this.thicknessMap && this.thicknessMap.isTexture) data.thicknessMap = this.thicknessMap.toJSON(meta).uuid;
    if (this.attenuationDistance !== void 0 && this.attenuationDistance !== Infinity) data.attenuationDistance = this.attenuationDistance;
    if (this.attenuationColor !== void 0) data.attenuationColor = this.attenuationColor.getHex();
    if (this.size !== void 0) data.size = this.size;
    if (this.shadowSide !== null) data.shadowSide = this.shadowSide;
    if (this.sizeAttenuation !== void 0) data.sizeAttenuation = this.sizeAttenuation;
    if (this.blending !== NormalBlending) data.blending = this.blending;
    if (this.side !== FrontSide) data.side = this.side;
    if (this.vertexColors === true) data.vertexColors = true;
    if (this.opacity < 1) data.opacity = this.opacity;
    if (this.transparent === true) data.transparent = true;
    if (this.blendSrc !== SrcAlphaFactor) data.blendSrc = this.blendSrc;
    if (this.blendDst !== OneMinusSrcAlphaFactor) data.blendDst = this.blendDst;
    if (this.blendEquation !== AddEquation) data.blendEquation = this.blendEquation;
    if (this.blendSrcAlpha !== null) data.blendSrcAlpha = this.blendSrcAlpha;
    if (this.blendDstAlpha !== null) data.blendDstAlpha = this.blendDstAlpha;
    if (this.blendEquationAlpha !== null) data.blendEquationAlpha = this.blendEquationAlpha;
    if (this.blendColor && this.blendColor.isColor) data.blendColor = this.blendColor.getHex();
    if (this.blendAlpha !== 0) data.blendAlpha = this.blendAlpha;
    if (this.depthFunc !== LessEqualDepth) data.depthFunc = this.depthFunc;
    if (this.depthTest === false) data.depthTest = this.depthTest;
    if (this.depthWrite === false) data.depthWrite = this.depthWrite;
    if (this.colorWrite === false) data.colorWrite = this.colorWrite;
    if (this.stencilWriteMask !== 255) data.stencilWriteMask = this.stencilWriteMask;
    if (this.stencilFunc !== AlwaysStencilFunc) data.stencilFunc = this.stencilFunc;
    if (this.stencilRef !== 0) data.stencilRef = this.stencilRef;
    if (this.stencilFuncMask !== 255) data.stencilFuncMask = this.stencilFuncMask;
    if (this.stencilFail !== KeepStencilOp) data.stencilFail = this.stencilFail;
    if (this.stencilZFail !== KeepStencilOp) data.stencilZFail = this.stencilZFail;
    if (this.stencilZPass !== KeepStencilOp) data.stencilZPass = this.stencilZPass;
    if (this.stencilWrite === true) data.stencilWrite = this.stencilWrite;
    if (this.rotation !== void 0 && this.rotation !== 0) data.rotation = this.rotation;
    if (this.polygonOffset === true) data.polygonOffset = true;
    if (this.polygonOffsetFactor !== 0) data.polygonOffsetFactor = this.polygonOffsetFactor;
    if (this.polygonOffsetUnits !== 0) data.polygonOffsetUnits = this.polygonOffsetUnits;
    if (this.linewidth !== void 0 && this.linewidth !== 1) data.linewidth = this.linewidth;
    if (this.dashSize !== void 0) data.dashSize = this.dashSize;
    if (this.gapSize !== void 0) data.gapSize = this.gapSize;
    if (this.scale !== void 0) data.scale = this.scale;
    if (this.dithering === true) data.dithering = true;
    if (this.alphaTest > 0) data.alphaTest = this.alphaTest;
    if (this.alphaHash === true) data.alphaHash = true;
    if (this.alphaToCoverage === true) data.alphaToCoverage = true;
    if (this.premultipliedAlpha === true) data.premultipliedAlpha = true;
    if (this.forceSinglePass === true) data.forceSinglePass = true;
    if (this.wireframe === true) data.wireframe = true;
    if (this.wireframeLinewidth > 1) data.wireframeLinewidth = this.wireframeLinewidth;
    if (this.wireframeLinecap !== "round") data.wireframeLinecap = this.wireframeLinecap;
    if (this.wireframeLinejoin !== "round") data.wireframeLinejoin = this.wireframeLinejoin;
    if (this.flatShading === true) data.flatShading = true;
    if (this.visible === false) data.visible = false;
    if (this.toneMapped === false) data.toneMapped = false;
    if (this.fog === false) data.fog = false;
    if (Object.keys(this.userData).length > 0) data.userData = this.userData;
    function extractFromCache(cache) {
      const values = [];
      for (const key in cache) {
        const data2 = cache[key];
        delete data2.metadata;
        values.push(data2);
      }
      return values;
    }
    if (isRootObject) {
      const textures = extractFromCache(meta.textures);
      const images = extractFromCache(meta.images);
      if (textures.length > 0) data.textures = textures;
      if (images.length > 0) data.images = images;
    }
    return data;
  }
  /**
   * Returns a new material with copied values from this instance.
   *
   * @return {Material} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given material to this instance.
   *
   * @param {Material} source - The material to copy.
   * @return {Material} A reference to this instance.
   */
  copy(source) {
    this.name = source.name;
    this.blending = source.blending;
    this.side = source.side;
    this.vertexColors = source.vertexColors;
    this.opacity = source.opacity;
    this.transparent = source.transparent;
    this.blendSrc = source.blendSrc;
    this.blendDst = source.blendDst;
    this.blendEquation = source.blendEquation;
    this.blendSrcAlpha = source.blendSrcAlpha;
    this.blendDstAlpha = source.blendDstAlpha;
    this.blendEquationAlpha = source.blendEquationAlpha;
    this.blendColor.copy(source.blendColor);
    this.blendAlpha = source.blendAlpha;
    this.depthFunc = source.depthFunc;
    this.depthTest = source.depthTest;
    this.depthWrite = source.depthWrite;
    this.stencilWriteMask = source.stencilWriteMask;
    this.stencilFunc = source.stencilFunc;
    this.stencilRef = source.stencilRef;
    this.stencilFuncMask = source.stencilFuncMask;
    this.stencilFail = source.stencilFail;
    this.stencilZFail = source.stencilZFail;
    this.stencilZPass = source.stencilZPass;
    this.stencilWrite = source.stencilWrite;
    const srcPlanes = source.clippingPlanes;
    let dstPlanes = null;
    if (srcPlanes !== null) {
      const n2 = srcPlanes.length;
      dstPlanes = new Array(n2);
      for (let i = 0; i !== n2; ++i) {
        dstPlanes[i] = srcPlanes[i].clone();
      }
    }
    this.clippingPlanes = dstPlanes;
    this.clipIntersection = source.clipIntersection;
    this.clipShadows = source.clipShadows;
    this.shadowSide = source.shadowSide;
    this.colorWrite = source.colorWrite;
    this.precision = source.precision;
    this.polygonOffset = source.polygonOffset;
    this.polygonOffsetFactor = source.polygonOffsetFactor;
    this.polygonOffsetUnits = source.polygonOffsetUnits;
    this.dithering = source.dithering;
    this.alphaTest = source.alphaTest;
    this.alphaHash = source.alphaHash;
    this.alphaToCoverage = source.alphaToCoverage;
    this.premultipliedAlpha = source.premultipliedAlpha;
    this.forceSinglePass = source.forceSinglePass;
    this.visible = source.visible;
    this.toneMapped = source.toneMapped;
    this.userData = JSON.parse(JSON.stringify(source.userData));
    return this;
  }
  /**
   * Frees the GPU-related resources allocated by this instance. Call this
   * method whenever this instance is no longer used in your app.
   *
   * @fires Material#dispose
   */
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
  /**
   * Setting this property to `true` indicates the engine the material
   * needs to be recompiled.
   *
   * @type {boolean}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
}
class MeshBasicMaterial extends Material {
  /**
   * Constructs a new mesh basic material.
   *
   * @param {Object} [parameters] - An object with one or more properties
   * defining the material's appearance. Any property of the material
   * (including any property from inherited materials) can be passed
   * in here. Color values can be passed any type of value accepted
   * by {@link Color#set}.
   */
  constructor(parameters) {
    super();
    this.isMeshBasicMaterial = true;
    this.type = "MeshBasicMaterial";
    this.color = new Color(16777215);
    this.map = null;
    this.lightMap = null;
    this.lightMapIntensity = 1;
    this.aoMap = null;
    this.aoMapIntensity = 1;
    this.specularMap = null;
    this.alphaMap = null;
    this.envMap = null;
    this.envMapRotation = new Euler();
    this.combine = MultiplyOperation;
    this.reflectivity = 1;
    this.refractionRatio = 0.98;
    this.wireframe = false;
    this.wireframeLinewidth = 1;
    this.wireframeLinecap = "round";
    this.wireframeLinejoin = "round";
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.map = source.map;
    this.lightMap = source.lightMap;
    this.lightMapIntensity = source.lightMapIntensity;
    this.aoMap = source.aoMap;
    this.aoMapIntensity = source.aoMapIntensity;
    this.specularMap = source.specularMap;
    this.alphaMap = source.alphaMap;
    this.envMap = source.envMap;
    this.envMapRotation.copy(source.envMapRotation);
    this.combine = source.combine;
    this.reflectivity = source.reflectivity;
    this.refractionRatio = source.refractionRatio;
    this.wireframe = source.wireframe;
    this.wireframeLinewidth = source.wireframeLinewidth;
    this.wireframeLinecap = source.wireframeLinecap;
    this.wireframeLinejoin = source.wireframeLinejoin;
    this.fog = source.fog;
    return this;
  }
}
const _vector$9 = /* @__PURE__ */ new Vector3();
const _vector2$1 = /* @__PURE__ */ new Vector2();
let _id$2 = 0;
class BufferAttribute {
  /**
   * Constructs a new buffer attribute.
   *
   * @param {TypedArray} array - The array holding the attribute data.
   * @param {number} itemSize - The item size.
   * @param {boolean} [normalized=false] - Whether the data are normalized or not.
   */
  constructor(array, itemSize, normalized = false) {
    if (Array.isArray(array)) {
      throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");
    }
    this.isBufferAttribute = true;
    Object.defineProperty(this, "id", { value: _id$2++ });
    this.name = "";
    this.array = array;
    this.itemSize = itemSize;
    this.count = array !== void 0 ? array.length / itemSize : 0;
    this.normalized = normalized;
    this.usage = StaticDrawUsage;
    this.updateRanges = [];
    this.gpuType = FloatType;
    this.version = 0;
  }
  /**
   * A callback function that is executed after the renderer has transferred the attribute
   * array data to the GPU.
   */
  onUploadCallback() {
  }
  /**
   * Flag to indicate that this attribute has changed and should be re-sent to
   * the GPU. Set this to `true` when you modify the value of the array.
   *
   * @type {number}
   * @default false
   * @param {boolean} value
   */
  set needsUpdate(value) {
    if (value === true) this.version++;
  }
  /**
   * Sets the usage of this buffer attribute.
   *
   * @param {(StaticDrawUsage|DynamicDrawUsage|StreamDrawUsage|StaticReadUsage|DynamicReadUsage|StreamReadUsage|StaticCopyUsage|DynamicCopyUsage|StreamCopyUsage)} value - The usage to set.
   * @return {BufferAttribute} A reference to this buffer attribute.
   */
  setUsage(value) {
    this.usage = value;
    return this;
  }
  /**
   * Adds a range of data in the data array to be updated on the GPU.
   *
   * @param {number} start - Position at which to start update.
   * @param {number} count - The number of components to update.
   */
  addUpdateRange(start, count) {
    this.updateRanges.push({ start, count });
  }
  /**
   * Clears the update ranges.
   */
  clearUpdateRanges() {
    this.updateRanges.length = 0;
  }
  /**
   * Copies the values of the given buffer attribute to this instance.
   *
   * @param {BufferAttribute} source - The buffer attribute to copy.
   * @return {BufferAttribute} A reference to this instance.
   */
  copy(source) {
    this.name = source.name;
    this.array = new source.array.constructor(source.array);
    this.itemSize = source.itemSize;
    this.count = source.count;
    this.normalized = source.normalized;
    this.usage = source.usage;
    this.gpuType = source.gpuType;
    return this;
  }
  /**
   * Copies a vector from the given buffer attribute to this one. The start
   * and destination position in the attribute buffers are represented by the
   * given indices.
   *
   * @param {number} index1 - The destination index into this buffer attribute.
   * @param {BufferAttribute} attribute - The buffer attribute to copy from.
   * @param {number} index2 - The source index into the given buffer attribute.
   * @return {BufferAttribute} A reference to this instance.
   */
  copyAt(index1, attribute, index2) {
    index1 *= this.itemSize;
    index2 *= attribute.itemSize;
    for (let i = 0, l2 = this.itemSize; i < l2; i++) {
      this.array[index1 + i] = attribute.array[index2 + i];
    }
    return this;
  }
  /**
   * Copies the given array data into this buffer attribute.
   *
   * @param {(TypedArray|Array)} array - The array to copy.
   * @return {BufferAttribute} A reference to this instance.
   */
  copyArray(array) {
    this.array.set(array);
    return this;
  }
  /**
   * Applies the given 3x3 matrix to the given attribute. Works with
   * item size `2` and `3`.
   *
   * @param {Matrix3} m - The matrix to apply.
   * @return {BufferAttribute} A reference to this instance.
   */
  applyMatrix3(m) {
    if (this.itemSize === 2) {
      for (let i = 0, l2 = this.count; i < l2; i++) {
        _vector2$1.fromBufferAttribute(this, i);
        _vector2$1.applyMatrix3(m);
        this.setXY(i, _vector2$1.x, _vector2$1.y);
      }
    } else if (this.itemSize === 3) {
      for (let i = 0, l2 = this.count; i < l2; i++) {
        _vector$9.fromBufferAttribute(this, i);
        _vector$9.applyMatrix3(m);
        this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
      }
    }
    return this;
  }
  /**
   * Applies the given 4x4 matrix to the given attribute. Only works with
   * item size `3`.
   *
   * @param {Matrix4} m - The matrix to apply.
   * @return {BufferAttribute} A reference to this instance.
   */
  applyMatrix4(m) {
    for (let i = 0, l2 = this.count; i < l2; i++) {
      _vector$9.fromBufferAttribute(this, i);
      _vector$9.applyMatrix4(m);
      this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
    }
    return this;
  }
  /**
   * Applies the given 3x3 normal matrix to the given attribute. Only works with
   * item size `3`.
   *
   * @param {Matrix3} m - The normal matrix to apply.
   * @return {BufferAttribute} A reference to this instance.
   */
  applyNormalMatrix(m) {
    for (let i = 0, l2 = this.count; i < l2; i++) {
      _vector$9.fromBufferAttribute(this, i);
      _vector$9.applyNormalMatrix(m);
      this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
    }
    return this;
  }
  /**
   * Applies the given 4x4 matrix to the given attribute. Only works with
   * item size `3` and with direction vectors.
   *
   * @param {Matrix4} m - The matrix to apply.
   * @return {BufferAttribute} A reference to this instance.
   */
  transformDirection(m) {
    for (let i = 0, l2 = this.count; i < l2; i++) {
      _vector$9.fromBufferAttribute(this, i);
      _vector$9.transformDirection(m);
      this.setXYZ(i, _vector$9.x, _vector$9.y, _vector$9.z);
    }
    return this;
  }
  /**
   * Sets the given array data in the buffer attribute.
   *
   * @param {(TypedArray|Array)} value - The array data to set.
   * @param {number} [offset=0] - The offset in this buffer attribute's array.
   * @return {BufferAttribute} A reference to this instance.
   */
  set(value, offset = 0) {
    this.array.set(value, offset);
    return this;
  }
  /**
   * Returns the given component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} component - The component index.
   * @return {number} The returned value.
   */
  getComponent(index2, component) {
    let value = this.array[index2 * this.itemSize + component];
    if (this.normalized) value = denormalize(value, this.array);
    return value;
  }
  /**
   * Sets the given value to the given component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} component - The component index.
   * @param {number} value - The value to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setComponent(index2, component, value) {
    if (this.normalized) value = normalize(value, this.array);
    this.array[index2 * this.itemSize + component] = value;
    return this;
  }
  /**
   * Returns the x component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @return {number} The x component.
   */
  getX(index2) {
    let x = this.array[index2 * this.itemSize];
    if (this.normalized) x = denormalize(x, this.array);
    return x;
  }
  /**
   * Sets the x component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} x - The value to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setX(index2, x) {
    if (this.normalized) x = normalize(x, this.array);
    this.array[index2 * this.itemSize] = x;
    return this;
  }
  /**
   * Returns the y component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @return {number} The y component.
   */
  getY(index2) {
    let y = this.array[index2 * this.itemSize + 1];
    if (this.normalized) y = denormalize(y, this.array);
    return y;
  }
  /**
   * Sets the y component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} y - The value to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setY(index2, y) {
    if (this.normalized) y = normalize(y, this.array);
    this.array[index2 * this.itemSize + 1] = y;
    return this;
  }
  /**
   * Returns the z component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @return {number} The z component.
   */
  getZ(index2) {
    let z = this.array[index2 * this.itemSize + 2];
    if (this.normalized) z = denormalize(z, this.array);
    return z;
  }
  /**
   * Sets the z component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} z - The value to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setZ(index2, z) {
    if (this.normalized) z = normalize(z, this.array);
    this.array[index2 * this.itemSize + 2] = z;
    return this;
  }
  /**
   * Returns the w component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @return {number} The w component.
   */
  getW(index2) {
    let w = this.array[index2 * this.itemSize + 3];
    if (this.normalized) w = denormalize(w, this.array);
    return w;
  }
  /**
   * Sets the w component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} w - The value to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setW(index2, w) {
    if (this.normalized) w = normalize(w, this.array);
    this.array[index2 * this.itemSize + 3] = w;
    return this;
  }
  /**
   * Sets the x and y component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} x - The value for the x component to set.
   * @param {number} y - The value for the y component to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setXY(index2, x, y) {
    index2 *= this.itemSize;
    if (this.normalized) {
      x = normalize(x, this.array);
      y = normalize(y, this.array);
    }
    this.array[index2 + 0] = x;
    this.array[index2 + 1] = y;
    return this;
  }
  /**
   * Sets the x, y and z component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} x - The value for the x component to set.
   * @param {number} y - The value for the y component to set.
   * @param {number} z - The value for the z component to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setXYZ(index2, x, y, z) {
    index2 *= this.itemSize;
    if (this.normalized) {
      x = normalize(x, this.array);
      y = normalize(y, this.array);
      z = normalize(z, this.array);
    }
    this.array[index2 + 0] = x;
    this.array[index2 + 1] = y;
    this.array[index2 + 2] = z;
    return this;
  }
  /**
   * Sets the x, y, z and w component of the vector at the given index.
   *
   * @param {number} index - The index into the buffer attribute.
   * @param {number} x - The value for the x component to set.
   * @param {number} y - The value for the y component to set.
   * @param {number} z - The value for the z component to set.
   * @param {number} w - The value for the w component to set.
   * @return {BufferAttribute} A reference to this instance.
   */
  setXYZW(index2, x, y, z, w) {
    index2 *= this.itemSize;
    if (this.normalized) {
      x = normalize(x, this.array);
      y = normalize(y, this.array);
      z = normalize(z, this.array);
      w = normalize(w, this.array);
    }
    this.array[index2 + 0] = x;
    this.array[index2 + 1] = y;
    this.array[index2 + 2] = z;
    this.array[index2 + 3] = w;
    return this;
  }
  /**
   * Sets the given callback function that is executed after the Renderer has transferred
   * the attribute array data to the GPU. Can be used to perform clean-up operations after
   * the upload when attribute data are not needed anymore on the CPU side.
   *
   * @param {Function} callback - The `onUpload()` callback.
   * @return {BufferAttribute} A reference to this instance.
   */
  onUpload(callback) {
    this.onUploadCallback = callback;
    return this;
  }
  /**
   * Returns a new buffer attribute with copied values from this instance.
   *
   * @return {BufferAttribute} A clone of this instance.
   */
  clone() {
    return new this.constructor(this.array, this.itemSize).copy(this);
  }
  /**
   * Serializes the buffer attribute into JSON.
   *
   * @return {Object} A JSON object representing the serialized buffer attribute.
   */
  toJSON() {
    const data = {
      itemSize: this.itemSize,
      type: this.array.constructor.name,
      array: Array.from(this.array),
      normalized: this.normalized
    };
    if (this.name !== "") data.name = this.name;
    if (this.usage !== StaticDrawUsage) data.usage = this.usage;
    return data;
  }
}
class Uint16BufferAttribute extends BufferAttribute {
  /**
   * Constructs a new buffer attribute.
   *
   * @param {(Array<number>|Uint16Array)} array - The array holding the attribute data.
   * @param {number} itemSize - The item size.
   * @param {boolean} [normalized=false] - Whether the data are normalized or not.
   */
  constructor(array, itemSize, normalized) {
    super(new Uint16Array(array), itemSize, normalized);
  }
}
class Uint32BufferAttribute extends BufferAttribute {
  /**
   * Constructs a new buffer attribute.
   *
   * @param {(Array<number>|Uint32Array)} array - The array holding the attribute data.
   * @param {number} itemSize - The item size.
   * @param {boolean} [normalized=false] - Whether the data are normalized or not.
   */
  constructor(array, itemSize, normalized) {
    super(new Uint32Array(array), itemSize, normalized);
  }
}
class Float32BufferAttribute extends BufferAttribute {
  /**
   * Constructs a new buffer attribute.
   *
   * @param {(Array<number>|Float32Array)} array - The array holding the attribute data.
   * @param {number} itemSize - The item size.
   * @param {boolean} [normalized=false] - Whether the data are normalized or not.
   */
  constructor(array, itemSize, normalized) {
    super(new Float32Array(array), itemSize, normalized);
  }
}
let _id$1 = 0;
const _m1 = /* @__PURE__ */ new Matrix4();
const _obj = /* @__PURE__ */ new Object3D();
const _offset = /* @__PURE__ */ new Vector3();
const _box$2 = /* @__PURE__ */ new Box3();
const _boxMorphTargets = /* @__PURE__ */ new Box3();
const _vector$8 = /* @__PURE__ */ new Vector3();
class BufferGeometry extends EventDispatcher {
  /**
   * Constructs a new geometry.
   */
  constructor() {
    super();
    this.isBufferGeometry = true;
    Object.defineProperty(this, "id", { value: _id$1++ });
    this.uuid = generateUUID();
    this.name = "";
    this.type = "BufferGeometry";
    this.index = null;
    this.indirect = null;
    this.attributes = {};
    this.morphAttributes = {};
    this.morphTargetsRelative = false;
    this.groups = [];
    this.boundingBox = null;
    this.boundingSphere = null;
    this.drawRange = { start: 0, count: Infinity };
    this.userData = {};
  }
  /**
   * Returns the index of this geometry.
   *
   * @return {?BufferAttribute} The index. Returns `null` if no index is defined.
   */
  getIndex() {
    return this.index;
  }
  /**
   * Sets the given index to this geometry.
   *
   * @param {Array<number>|BufferAttribute} index - The index to set.
   * @return {BufferGeometry} A reference to this instance.
   */
  setIndex(index2) {
    if (Array.isArray(index2)) {
      this.index = new (arrayNeedsUint32(index2) ? Uint32BufferAttribute : Uint16BufferAttribute)(index2, 1);
    } else {
      this.index = index2;
    }
    return this;
  }
  /**
   * Sets the given indirect attribute to this geometry.
   *
   * @param {BufferAttribute} indirect - The attribute holding indirect draw calls.
   * @return {BufferGeometry} A reference to this instance.
   */
  setIndirect(indirect) {
    this.indirect = indirect;
    return this;
  }
  /**
   * Returns the indirect attribute of this geometry.
   *
   * @return {?BufferAttribute} The indirect attribute. Returns `null` if no indirect attribute is defined.
   */
  getIndirect() {
    return this.indirect;
  }
  /**
   * Returns the buffer attribute for the given name.
   *
   * @param {string} name - The attribute name.
   * @return {BufferAttribute|InterleavedBufferAttribute|undefined} The buffer attribute.
   * Returns `undefined` if not attribute has been found.
   */
  getAttribute(name) {
    return this.attributes[name];
  }
  /**
   * Sets the given attribute for the given name.
   *
   * @param {string} name - The attribute name.
   * @param {BufferAttribute|InterleavedBufferAttribute} attribute - The attribute to set.
   * @return {BufferGeometry} A reference to this instance.
   */
  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }
  /**
   * Deletes the attribute for the given name.
   *
   * @param {string} name - The attribute name to delete.
   * @return {BufferGeometry} A reference to this instance.
   */
  deleteAttribute(name) {
    delete this.attributes[name];
    return this;
  }
  /**
   * Returns `true` if this geometry has an attribute for the given name.
   *
   * @param {string} name - The attribute name.
   * @return {boolean} Whether this geometry has an attribute for the given name or not.
   */
  hasAttribute(name) {
    return this.attributes[name] !== void 0;
  }
  /**
   * Adds a group to this geometry.
   *
   * @param {number} start - The first element in this draw call. That is the first
   * vertex for non-indexed geometry, otherwise the first triangle index.
   * @param {number} count - Specifies how many vertices (or indices) are part of this group.
   * @param {number} [materialIndex=0] - The material array index to use.
   */
  addGroup(start, count, materialIndex = 0) {
    this.groups.push({
      start,
      count,
      materialIndex
    });
  }
  /**
   * Clears all groups.
   */
  clearGroups() {
    this.groups = [];
  }
  /**
   * Sets the draw range for this geometry.
   *
   * @param {number} start - The first vertex for non-indexed geometry, otherwise the first triangle index.
   * @param {number} count - For non-indexed BufferGeometry, `count` is the number of vertices to render.
   * For indexed BufferGeometry, `count` is the number of indices to render.
   */
  setDrawRange(start, count) {
    this.drawRange.start = start;
    this.drawRange.count = count;
  }
  /**
   * Applies the given 4x4 transformation matrix to the geometry.
   *
   * @param {Matrix4} matrix - The matrix to apply.
   * @return {BufferGeometry} A reference to this instance.
   */
  applyMatrix4(matrix) {
    const position = this.attributes.position;
    if (position !== void 0) {
      position.applyMatrix4(matrix);
      position.needsUpdate = true;
    }
    const normal = this.attributes.normal;
    if (normal !== void 0) {
      const normalMatrix = new Matrix3().getNormalMatrix(matrix);
      normal.applyNormalMatrix(normalMatrix);
      normal.needsUpdate = true;
    }
    const tangent = this.attributes.tangent;
    if (tangent !== void 0) {
      tangent.transformDirection(matrix);
      tangent.needsUpdate = true;
    }
    if (this.boundingBox !== null) {
      this.computeBoundingBox();
    }
    if (this.boundingSphere !== null) {
      this.computeBoundingSphere();
    }
    return this;
  }
  /**
   * Applies the rotation represented by the Quaternion to the geometry.
   *
   * @param {Quaternion} q - The Quaternion to apply.
   * @return {BufferGeometry} A reference to this instance.
   */
  applyQuaternion(q) {
    _m1.makeRotationFromQuaternion(q);
    this.applyMatrix4(_m1);
    return this;
  }
  /**
   * Rotates the geometry about the X axis. This is typically done as a one time
   * operation, and not during a loop. Use {@link Object3D#rotation} for typical
   * real-time mesh rotation.
   *
   * @param {number} angle - The angle in radians.
   * @return {BufferGeometry} A reference to this instance.
   */
  rotateX(angle) {
    _m1.makeRotationX(angle);
    this.applyMatrix4(_m1);
    return this;
  }
  /**
   * Rotates the geometry about the Y axis. This is typically done as a one time
   * operation, and not during a loop. Use {@link Object3D#rotation} for typical
   * real-time mesh rotation.
   *
   * @param {number} angle - The angle in radians.
   * @return {BufferGeometry} A reference to this instance.
   */
  rotateY(angle) {
    _m1.makeRotationY(angle);
    this.applyMatrix4(_m1);
    return this;
  }
  /**
   * Rotates the geometry about the Z axis. This is typically done as a one time
   * operation, and not during a loop. Use {@link Object3D#rotation} for typical
   * real-time mesh rotation.
   *
   * @param {number} angle - The angle in radians.
   * @return {BufferGeometry} A reference to this instance.
   */
  rotateZ(angle) {
    _m1.makeRotationZ(angle);
    this.applyMatrix4(_m1);
    return this;
  }
  /**
   * Translates the geometry. This is typically done as a one time
   * operation, and not during a loop. Use {@link Object3D#position} for typical
   * real-time mesh rotation.
   *
   * @param {number} x - The x offset.
   * @param {number} y - The y offset.
   * @param {number} z - The z offset.
   * @return {BufferGeometry} A reference to this instance.
   */
  translate(x, y, z) {
    _m1.makeTranslation(x, y, z);
    this.applyMatrix4(_m1);
    return this;
  }
  /**
   * Scales the geometry. This is typically done as a one time
   * operation, and not during a loop. Use {@link Object3D#scale} for typical
   * real-time mesh rotation.
   *
   * @param {number} x - The x scale.
   * @param {number} y - The y scale.
   * @param {number} z - The z scale.
   * @return {BufferGeometry} A reference to this instance.
   */
  scale(x, y, z) {
    _m1.makeScale(x, y, z);
    this.applyMatrix4(_m1);
    return this;
  }
  /**
   * Rotates the geometry to face a point in 3D space. This is typically done as a one time
   * operation, and not during a loop. Use {@link Object3D#lookAt} for typical
   * real-time mesh rotation.
   *
   * @param {Vector3} vector - The target point.
   * @return {BufferGeometry} A reference to this instance.
   */
  lookAt(vector) {
    _obj.lookAt(vector);
    _obj.updateMatrix();
    this.applyMatrix4(_obj.matrix);
    return this;
  }
  /**
   * Center the geometry based on its bounding box.
   *
   * @return {BufferGeometry} A reference to this instance.
   */
  center() {
    this.computeBoundingBox();
    this.boundingBox.getCenter(_offset).negate();
    this.translate(_offset.x, _offset.y, _offset.z);
    return this;
  }
  /**
   * Defines a geometry by creating a `position` attribute based on the given array of points. The array
   * can hold 2D or 3D vectors. When using two-dimensional data, the `z` coordinate for all vertices is
   * set to `0`.
   *
   * If the method is used with an existing `position` attribute, the vertex data are overwritten with the
   * data from the array. The length of the array must match the vertex count.
   *
   * @param {Array<Vector2>|Array<Vector3>} points - The points.
   * @return {BufferGeometry} A reference to this instance.
   */
  setFromPoints(points) {
    const positionAttribute = this.getAttribute("position");
    if (positionAttribute === void 0) {
      const position = [];
      for (let i = 0, l2 = points.length; i < l2; i++) {
        const point = points[i];
        position.push(point.x, point.y, point.z || 0);
      }
      this.setAttribute("position", new Float32BufferAttribute(position, 3));
    } else {
      const l2 = Math.min(points.length, positionAttribute.count);
      for (let i = 0; i < l2; i++) {
        const point = points[i];
        positionAttribute.setXYZ(i, point.x, point.y, point.z || 0);
      }
      if (points.length > positionAttribute.count) {
        warn("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.");
      }
      positionAttribute.needsUpdate = true;
    }
    return this;
  }
  /**
   * Computes the bounding box of the geometry, and updates the `boundingBox` member.
   * The bounding box is not computed by the engine; it must be computed by your app.
   * You may need to recompute the bounding box if the geometry vertices are modified.
   */
  computeBoundingBox() {
    if (this.boundingBox === null) {
      this.boundingBox = new Box3();
    }
    const position = this.attributes.position;
    const morphAttributesPosition = this.morphAttributes.position;
    if (position && position.isGLBufferAttribute) {
      error("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.", this);
      this.boundingBox.set(
        new Vector3(-Infinity, -Infinity, -Infinity),
        new Vector3(Infinity, Infinity, Infinity)
      );
      return;
    }
    if (position !== void 0) {
      this.boundingBox.setFromBufferAttribute(position);
      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          _box$2.setFromBufferAttribute(morphAttribute);
          if (this.morphTargetsRelative) {
            _vector$8.addVectors(this.boundingBox.min, _box$2.min);
            this.boundingBox.expandByPoint(_vector$8);
            _vector$8.addVectors(this.boundingBox.max, _box$2.max);
            this.boundingBox.expandByPoint(_vector$8);
          } else {
            this.boundingBox.expandByPoint(_box$2.min);
            this.boundingBox.expandByPoint(_box$2.max);
          }
        }
      }
    } else {
      this.boundingBox.makeEmpty();
    }
    if (isNaN(this.boundingBox.min.x) || isNaN(this.boundingBox.min.y) || isNaN(this.boundingBox.min.z)) {
      error('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.', this);
    }
  }
  /**
   * Computes the bounding sphere of the geometry, and updates the `boundingSphere` member.
   * The engine automatically computes the bounding sphere when it is needed, e.g., for ray casting or view frustum culling.
   * You may need to recompute the bounding sphere if the geometry vertices are modified.
   */
  computeBoundingSphere() {
    if (this.boundingSphere === null) {
      this.boundingSphere = new Sphere();
    }
    const position = this.attributes.position;
    const morphAttributesPosition = this.morphAttributes.position;
    if (position && position.isGLBufferAttribute) {
      error("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.", this);
      this.boundingSphere.set(new Vector3(), Infinity);
      return;
    }
    if (position) {
      const center = this.boundingSphere.center;
      _box$2.setFromBufferAttribute(position);
      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          _boxMorphTargets.setFromBufferAttribute(morphAttribute);
          if (this.morphTargetsRelative) {
            _vector$8.addVectors(_box$2.min, _boxMorphTargets.min);
            _box$2.expandByPoint(_vector$8);
            _vector$8.addVectors(_box$2.max, _boxMorphTargets.max);
            _box$2.expandByPoint(_vector$8);
          } else {
            _box$2.expandByPoint(_boxMorphTargets.min);
            _box$2.expandByPoint(_boxMorphTargets.max);
          }
        }
      }
      _box$2.getCenter(center);
      let maxRadiusSq = 0;
      for (let i = 0, il = position.count; i < il; i++) {
        _vector$8.fromBufferAttribute(position, i);
        maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_vector$8));
      }
      if (morphAttributesPosition) {
        for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
          const morphAttribute = morphAttributesPosition[i];
          const morphTargetsRelative = this.morphTargetsRelative;
          for (let j = 0, jl = morphAttribute.count; j < jl; j++) {
            _vector$8.fromBufferAttribute(morphAttribute, j);
            if (morphTargetsRelative) {
              _offset.fromBufferAttribute(position, j);
              _vector$8.add(_offset);
            }
            maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_vector$8));
          }
        }
      }
      this.boundingSphere.radius = Math.sqrt(maxRadiusSq);
      if (isNaN(this.boundingSphere.radius)) {
        error('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.', this);
      }
    }
  }
  /**
   * Calculates and adds a tangent attribute to this geometry.
   *
   * The computation is only supported for indexed geometries and if position, normal, and uv attributes
   * are defined. When using a tangent space normal map, prefer the MikkTSpace algorithm provided by
   * {@link BufferGeometryUtils#computeMikkTSpaceTangents} instead.
   */
  computeTangents() {
    const index2 = this.index;
    const attributes = this.attributes;
    if (index2 === null || attributes.position === void 0 || attributes.normal === void 0 || attributes.uv === void 0) {
      error("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");
      return;
    }
    const positionAttribute = attributes.position;
    const normalAttribute = attributes.normal;
    const uvAttribute = attributes.uv;
    if (this.hasAttribute("tangent") === false) {
      this.setAttribute("tangent", new BufferAttribute(new Float32Array(4 * positionAttribute.count), 4));
    }
    const tangentAttribute = this.getAttribute("tangent");
    const tan1 = [], tan2 = [];
    for (let i = 0; i < positionAttribute.count; i++) {
      tan1[i] = new Vector3();
      tan2[i] = new Vector3();
    }
    const vA = new Vector3(), vB = new Vector3(), vC = new Vector3(), uvA = new Vector2(), uvB = new Vector2(), uvC = new Vector2(), sdir = new Vector3(), tdir = new Vector3();
    function handleTriangle(a2, b2, c2) {
      vA.fromBufferAttribute(positionAttribute, a2);
      vB.fromBufferAttribute(positionAttribute, b2);
      vC.fromBufferAttribute(positionAttribute, c2);
      uvA.fromBufferAttribute(uvAttribute, a2);
      uvB.fromBufferAttribute(uvAttribute, b2);
      uvC.fromBufferAttribute(uvAttribute, c2);
      vB.sub(vA);
      vC.sub(vA);
      uvB.sub(uvA);
      uvC.sub(uvA);
      const r2 = 1 / (uvB.x * uvC.y - uvC.x * uvB.y);
      if (!isFinite(r2)) return;
      sdir.copy(vB).multiplyScalar(uvC.y).addScaledVector(vC, -uvB.y).multiplyScalar(r2);
      tdir.copy(vC).multiplyScalar(uvB.x).addScaledVector(vB, -uvC.x).multiplyScalar(r2);
      tan1[a2].add(sdir);
      tan1[b2].add(sdir);
      tan1[c2].add(sdir);
      tan2[a2].add(tdir);
      tan2[b2].add(tdir);
      tan2[c2].add(tdir);
    }
    let groups = this.groups;
    if (groups.length === 0) {
      groups = [{
        start: 0,
        count: index2.count
      }];
    }
    for (let i = 0, il = groups.length; i < il; ++i) {
      const group = groups[i];
      const start = group.start;
      const count = group.count;
      for (let j = start, jl = start + count; j < jl; j += 3) {
        handleTriangle(
          index2.getX(j + 0),
          index2.getX(j + 1),
          index2.getX(j + 2)
        );
      }
    }
    const tmp = new Vector3(), tmp2 = new Vector3();
    const n2 = new Vector3(), n22 = new Vector3();
    function handleVertex(v) {
      n2.fromBufferAttribute(normalAttribute, v);
      n22.copy(n2);
      const t2 = tan1[v];
      tmp.copy(t2);
      tmp.sub(n2.multiplyScalar(n2.dot(t2))).normalize();
      tmp2.crossVectors(n22, t2);
      const test = tmp2.dot(tan2[v]);
      const w = test < 0 ? -1 : 1;
      tangentAttribute.setXYZW(v, tmp.x, tmp.y, tmp.z, w);
    }
    for (let i = 0, il = groups.length; i < il; ++i) {
      const group = groups[i];
      const start = group.start;
      const count = group.count;
      for (let j = start, jl = start + count; j < jl; j += 3) {
        handleVertex(index2.getX(j + 0));
        handleVertex(index2.getX(j + 1));
        handleVertex(index2.getX(j + 2));
      }
    }
  }
  /**
   * Computes vertex normals for the given vertex data. For indexed geometries, the method sets
   * each vertex normal to be the average of the face normals of the faces that share that vertex.
   * For non-indexed geometries, vertices are not shared, and the method sets each vertex normal
   * to be the same as the face normal.
   */
  computeVertexNormals() {
    const index2 = this.index;
    const positionAttribute = this.getAttribute("position");
    if (positionAttribute !== void 0) {
      let normalAttribute = this.getAttribute("normal");
      if (normalAttribute === void 0) {
        normalAttribute = new BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
        this.setAttribute("normal", normalAttribute);
      } else {
        for (let i = 0, il = normalAttribute.count; i < il; i++) {
          normalAttribute.setXYZ(i, 0, 0, 0);
        }
      }
      const pA = new Vector3(), pB = new Vector3(), pC = new Vector3();
      const nA = new Vector3(), nB = new Vector3(), nC = new Vector3();
      const cb = new Vector3(), ab = new Vector3();
      if (index2) {
        for (let i = 0, il = index2.count; i < il; i += 3) {
          const vA = index2.getX(i + 0);
          const vB = index2.getX(i + 1);
          const vC = index2.getX(i + 2);
          pA.fromBufferAttribute(positionAttribute, vA);
          pB.fromBufferAttribute(positionAttribute, vB);
          pC.fromBufferAttribute(positionAttribute, vC);
          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);
          nA.fromBufferAttribute(normalAttribute, vA);
          nB.fromBufferAttribute(normalAttribute, vB);
          nC.fromBufferAttribute(normalAttribute, vC);
          nA.add(cb);
          nB.add(cb);
          nC.add(cb);
          normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
          normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
          normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
        }
      } else {
        for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
          pA.fromBufferAttribute(positionAttribute, i + 0);
          pB.fromBufferAttribute(positionAttribute, i + 1);
          pC.fromBufferAttribute(positionAttribute, i + 2);
          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);
          normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
          normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
        }
      }
      this.normalizeNormals();
      normalAttribute.needsUpdate = true;
    }
  }
  /**
   * Ensures every normal vector in a geometry will have a magnitude of `1`. This will
   * correct lighting on the geometry surfaces.
   */
  normalizeNormals() {
    const normals = this.attributes.normal;
    for (let i = 0, il = normals.count; i < il; i++) {
      _vector$8.fromBufferAttribute(normals, i);
      _vector$8.normalize();
      normals.setXYZ(i, _vector$8.x, _vector$8.y, _vector$8.z);
    }
  }
  /**
   * Return a new non-index version of this indexed geometry. If the geometry
   * is already non-indexed, the method is a NOOP.
   *
   * @return {BufferGeometry} The non-indexed version of this indexed geometry.
   */
  toNonIndexed() {
    function convertBufferAttribute(attribute, indices2) {
      const array = attribute.array;
      const itemSize = attribute.itemSize;
      const normalized = attribute.normalized;
      const array2 = new array.constructor(indices2.length * itemSize);
      let index2 = 0, index22 = 0;
      for (let i = 0, l2 = indices2.length; i < l2; i++) {
        if (attribute.isInterleavedBufferAttribute) {
          index2 = indices2[i] * attribute.data.stride + attribute.offset;
        } else {
          index2 = indices2[i] * itemSize;
        }
        for (let j = 0; j < itemSize; j++) {
          array2[index22++] = array[index2++];
        }
      }
      return new BufferAttribute(array2, itemSize, normalized);
    }
    if (this.index === null) {
      warn("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.");
      return this;
    }
    const geometry2 = new BufferGeometry();
    const indices = this.index.array;
    const attributes = this.attributes;
    for (const name in attributes) {
      const attribute = attributes[name];
      const newAttribute = convertBufferAttribute(attribute, indices);
      geometry2.setAttribute(name, newAttribute);
    }
    const morphAttributes = this.morphAttributes;
    for (const name in morphAttributes) {
      const morphArray = [];
      const morphAttribute = morphAttributes[name];
      for (let i = 0, il = morphAttribute.length; i < il; i++) {
        const attribute = morphAttribute[i];
        const newAttribute = convertBufferAttribute(attribute, indices);
        morphArray.push(newAttribute);
      }
      geometry2.morphAttributes[name] = morphArray;
    }
    geometry2.morphTargetsRelative = this.morphTargetsRelative;
    const groups = this.groups;
    for (let i = 0, l2 = groups.length; i < l2; i++) {
      const group = groups[i];
      geometry2.addGroup(group.start, group.count, group.materialIndex);
    }
    return geometry2;
  }
  /**
   * Serializes the geometry into JSON.
   *
   * @return {Object} A JSON object representing the serialized geometry.
   */
  toJSON() {
    const data = {
      metadata: {
        version: 4.7,
        type: "BufferGeometry",
        generator: "BufferGeometry.toJSON"
      }
    };
    data.uuid = this.uuid;
    data.type = this.type;
    if (this.name !== "") data.name = this.name;
    if (Object.keys(this.userData).length > 0) data.userData = this.userData;
    if (this.parameters !== void 0) {
      const parameters = this.parameters;
      for (const key in parameters) {
        if (parameters[key] !== void 0) data[key] = parameters[key];
      }
      return data;
    }
    data.data = { attributes: {} };
    const index2 = this.index;
    if (index2 !== null) {
      data.data.index = {
        type: index2.array.constructor.name,
        array: Array.prototype.slice.call(index2.array)
      };
    }
    const attributes = this.attributes;
    for (const key in attributes) {
      const attribute = attributes[key];
      data.data.attributes[key] = attribute.toJSON(data.data);
    }
    const morphAttributes = {};
    let hasMorphAttributes = false;
    for (const key in this.morphAttributes) {
      const attributeArray = this.morphAttributes[key];
      const array = [];
      for (let i = 0, il = attributeArray.length; i < il; i++) {
        const attribute = attributeArray[i];
        array.push(attribute.toJSON(data.data));
      }
      if (array.length > 0) {
        morphAttributes[key] = array;
        hasMorphAttributes = true;
      }
    }
    if (hasMorphAttributes) {
      data.data.morphAttributes = morphAttributes;
      data.data.morphTargetsRelative = this.morphTargetsRelative;
    }
    const groups = this.groups;
    if (groups.length > 0) {
      data.data.groups = JSON.parse(JSON.stringify(groups));
    }
    const boundingSphere = this.boundingSphere;
    if (boundingSphere !== null) {
      data.data.boundingSphere = boundingSphere.toJSON();
    }
    return data;
  }
  /**
   * Returns a new geometry with copied values from this instance.
   *
   * @return {BufferGeometry} A clone of this instance.
   */
  clone() {
    return new this.constructor().copy(this);
  }
  /**
   * Copies the values of the given geometry to this instance.
   *
   * @param {BufferGeometry} source - The geometry to copy.
   * @return {BufferGeometry} A reference to this instance.
   */
  copy(source) {
    this.index = null;
    this.attributes = {};
    this.morphAttributes = {};
    this.groups = [];
    this.boundingBox = null;
    this.boundingSphere = null;
    const data = {};
    this.name = source.name;
    const index2 = source.index;
    if (index2 !== null) {
      this.setIndex(index2.clone());
    }
    const attributes = source.attributes;
    for (const name in attributes) {
      const attribute = attributes[name];
      this.setAttribute(name, attribute.clone(data));
    }
    const morphAttributes = source.morphAttributes;
    for (const name in morphAttributes) {
      const array = [];
      const morphAttribute = morphAttributes[name];
      for (let i = 0, l2 = morphAttribute.length; i < l2; i++) {
        array.push(morphAttribute[i].clone(data));
      }
      this.morphAttributes[name] = array;
    }
    this.morphTargetsRelative = source.morphTargetsRelative;
    const groups = source.groups;
    for (let i = 0, l2 = groups.length; i < l2; i++) {
      const group = groups[i];
      this.addGroup(group.start, group.count, group.materialIndex);
    }
    const boundingBox = source.boundingBox;
    if (boundingBox !== null) {
      this.boundingBox = boundingBox.clone();
    }
    const boundingSphere = source.boundingSphere;
    if (boundingSphere !== null) {
      this.boundingSphere = boundingSphere.clone();
    }
    this.drawRange.start = source.drawRange.start;
    this.drawRange.count = source.drawRange.count;
    this.userData = source.userData;
    return this;
  }
  /**
   * Frees the GPU-related resources allocated by this instance. Call this
   * method whenever this instance is no longer used in your app.
   *
   * @fires BufferGeometry#dispose
   */
  dispose() {
    this.dispatchEvent({ type: "dispose" });
  }
}
const _inverseMatrix$3 = /* @__PURE__ */ new Matrix4();
const _ray$3 = /* @__PURE__ */ new Ray();
const _sphere$6 = /* @__PURE__ */ new Sphere();
const _sphereHitAt = /* @__PURE__ */ new Vector3();
const _vA$1 = /* @__PURE__ */ new Vector3();
const _vB$1 = /* @__PURE__ */ new Vector3();
const _vC$1 = /* @__PURE__ */ new Vector3();
const _tempA = /* @__PURE__ */ new Vector3();
const _morphA = /* @__PURE__ */ new Vector3();
const _intersectionPoint = /* @__PURE__ */ new Vector3();
const _intersectionPointWorld = /* @__PURE__ */ new Vector3();
class Mesh extends Object3D {
  /**
   * Constructs a new mesh.
   *
   * @param {BufferGeometry} [geometry] - The mesh geometry.
   * @param {Material|Array<Material>} [material] - The mesh material.
   */
  constructor(geometry = new BufferGeometry(), material = new MeshBasicMaterial()) {
    super();
    this.isMesh = true;
    this.type = "Mesh";
    this.geometry = geometry;
    this.material = material;
    this.morphTargetDictionary = void 0;
    this.morphTargetInfluences = void 0;
    this.count = 1;
    this.updateMorphTargets();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    if (source.morphTargetInfluences !== void 0) {
      this.morphTargetInfluences = source.morphTargetInfluences.slice();
    }
    if (source.morphTargetDictionary !== void 0) {
      this.morphTargetDictionary = Object.assign({}, source.morphTargetDictionary);
    }
    this.material = Array.isArray(source.material) ? source.material.slice() : source.material;
    this.geometry = source.geometry;
    return this;
  }
  /**
   * Sets the values of {@link Mesh#morphTargetDictionary} and {@link Mesh#morphTargetInfluences}
   * to make sure existing morph targets can influence this 3D object.
   */
  updateMorphTargets() {
    const geometry = this.geometry;
    const morphAttributes = geometry.morphAttributes;
    const keys = Object.keys(morphAttributes);
    if (keys.length > 0) {
      const morphAttribute = morphAttributes[keys[0]];
      if (morphAttribute !== void 0) {
        this.morphTargetInfluences = [];
        this.morphTargetDictionary = {};
        for (let m = 0, ml = morphAttribute.length; m < ml; m++) {
          const name = morphAttribute[m].name || String(m);
          this.morphTargetInfluences.push(0);
          this.morphTargetDictionary[name] = m;
        }
      }
    }
  }
  /**
   * Returns the local-space position of the vertex at the given index, taking into
   * account the current animation state of both morph targets and skinning.
   *
   * @param {number} index - The vertex index.
   * @param {Vector3} target - The target object that is used to store the method's result.
   * @return {Vector3} The vertex position in local space.
   */
  getVertexPosition(index2, target) {
    const geometry = this.geometry;
    const position = geometry.attributes.position;
    const morphPosition = geometry.morphAttributes.position;
    const morphTargetsRelative = geometry.morphTargetsRelative;
    target.fromBufferAttribute(position, index2);
    const morphInfluences = this.morphTargetInfluences;
    if (morphPosition && morphInfluences) {
      _morphA.set(0, 0, 0);
      for (let i = 0, il = morphPosition.length; i < il; i++) {
        const influence = morphInfluences[i];
        const morphAttribute = morphPosition[i];
        if (influence === 0) continue;
        _tempA.fromBufferAttribute(morphAttribute, index2);
        if (morphTargetsRelative) {
          _morphA.addScaledVector(_tempA, influence);
        } else {
          _morphA.addScaledVector(_tempA.sub(target), influence);
        }
      }
      target.add(_morphA);
    }
    return target;
  }
  /**
   * Computes intersection points between a casted ray and this line.
   *
   * @param {Raycaster} raycaster - The raycaster.
   * @param {Array<Object>} intersects - The target array that holds the intersection points.
   */
  raycast(raycaster, intersects) {
    const geometry = this.geometry;
    const material = this.material;
    const matrixWorld = this.matrixWorld;
    if (material === void 0) return;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    _sphere$6.copy(geometry.boundingSphere);
    _sphere$6.applyMatrix4(matrixWorld);
    _ray$3.copy(raycaster.ray).recast(raycaster.near);
    if (_sphere$6.containsPoint(_ray$3.origin) === false) {
      if (_ray$3.intersectSphere(_sphere$6, _sphereHitAt) === null) return;
      if (_ray$3.origin.distanceToSquared(_sphereHitAt) > (raycaster.far - raycaster.near) ** 2) return;
    }
    _inverseMatrix$3.copy(matrixWorld).invert();
    _ray$3.copy(raycaster.ray).applyMatrix4(_inverseMatrix$3);
    if (geometry.boundingBox !== null) {
      if (_ray$3.intersectsBox(geometry.boundingBox) === false) return;
    }
    this._computeIntersections(raycaster, intersects, _ray$3);
  }
  _computeIntersections(raycaster, intersects, rayLocalSpace) {
    let intersection;
    const geometry = this.geometry;
    const material = this.material;
    const index2 = geometry.index;
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const uv1 = geometry.attributes.uv1;
    const normal = geometry.attributes.normal;
    const groups = geometry.groups;
    const drawRange = geometry.drawRange;
    if (index2 !== null) {
      if (Array.isArray(material)) {
        for (let i = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupMaterial = material[group.materialIndex];
          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(index2.count, Math.min(group.start + group.count, drawRange.start + drawRange.count));
          for (let j = start, jl = end; j < jl; j += 3) {
            const a2 = index2.getX(j);
            const b2 = index2.getX(j + 1);
            const c2 = index2.getX(j + 2);
            intersection = checkGeometryIntersection(this, groupMaterial, raycaster, rayLocalSpace, uv, uv1, normal, a2, b2, c2);
            if (intersection) {
              intersection.faceIndex = Math.floor(j / 3);
              intersection.face.materialIndex = group.materialIndex;
              intersects.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(index2.count, drawRange.start + drawRange.count);
        for (let i = start, il = end; i < il; i += 3) {
          const a2 = index2.getX(i);
          const b2 = index2.getX(i + 1);
          const c2 = index2.getX(i + 2);
          intersection = checkGeometryIntersection(this, material, raycaster, rayLocalSpace, uv, uv1, normal, a2, b2, c2);
          if (intersection) {
            intersection.faceIndex = Math.floor(i / 3);
            intersects.push(intersection);
          }
        }
      }
    } else if (position !== void 0) {
      if (Array.isArray(material)) {
        for (let i = 0, il = groups.length; i < il; i++) {
          const group = groups[i];
          const groupMaterial = material[group.materialIndex];
          const start = Math.max(group.start, drawRange.start);
          const end = Math.min(position.count, Math.min(group.start + group.count, drawRange.start + drawRange.count));
          for (let j = start, jl = end; j < jl; j += 3) {
            const a2 = j;
            const b2 = j + 1;
            const c2 = j + 2;
            intersection = checkGeometryIntersection(this, groupMaterial, raycaster, rayLocalSpace, uv, uv1, normal, a2, b2, c2);
            if (intersection) {
              intersection.faceIndex = Math.floor(j / 3);
              intersection.face.materialIndex = group.materialIndex;
              intersects.push(intersection);
            }
          }
        }
      } else {
        const start = Math.max(0, drawRange.start);
        const end = Math.min(position.count, drawRange.start + drawRange.count);
        for (let i = start, il = end; i < il; i += 3) {
          const a2 = i;
          const b2 = i + 1;
          const c2 = i + 2;
          intersection = checkGeometryIntersection(this, material, raycaster, rayLocalSpace, uv, uv1, normal, a2, b2, c2);
          if (intersection) {
            intersection.faceIndex = Math.floor(i / 3);
            intersects.push(intersection);
          }
        }
      }
    }
  }
}
function checkIntersection$1(object2, material, raycaster, ray, pA, pB, pC, point) {
  let intersect;
  if (material.side === BackSide) {
    intersect = ray.intersectTriangle(pC, pB, pA, true, point);
  } else {
    intersect = ray.intersectTriangle(pA, pB, pC, material.side === FrontSide, point);
  }
  if (intersect === null) return null;
  _intersectionPointWorld.copy(point);
  _intersectionPointWorld.applyMatrix4(object2.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(_intersectionPointWorld);
  if (distance < raycaster.near || distance > raycaster.far) return null;
  return {
    distance,
    point: _intersectionPointWorld.clone(),
    object: object2
  };
}
function checkGeometryIntersection(object2, material, raycaster, ray, uv, uv1, normal, a2, b2, c2) {
  object2.getVertexPosition(a2, _vA$1);
  object2.getVertexPosition(b2, _vB$1);
  object2.getVertexPosition(c2, _vC$1);
  const intersection = checkIntersection$1(object2, material, raycaster, ray, _vA$1, _vB$1, _vC$1, _intersectionPoint);
  if (intersection) {
    const barycoord = new Vector3();
    Triangle.getBarycoord(_intersectionPoint, _vA$1, _vB$1, _vC$1, barycoord);
    if (uv) {
      intersection.uv = Triangle.getInterpolatedAttribute(uv, a2, b2, c2, barycoord, new Vector2());
    }
    if (uv1) {
      intersection.uv1 = Triangle.getInterpolatedAttribute(uv1, a2, b2, c2, barycoord, new Vector2());
    }
    if (normal) {
      intersection.normal = Triangle.getInterpolatedAttribute(normal, a2, b2, c2, barycoord, new Vector3());
      if (intersection.normal.dot(ray.direction) > 0) {
        intersection.normal.multiplyScalar(-1);
      }
    }
    const face = {
      a: a2,
      b: b2,
      c: c2,
      normal: new Vector3(),
      materialIndex: 0
    };
    Triangle.getNormal(_vA$1, _vB$1, _vC$1, face.normal);
    intersection.face = face;
    intersection.barycoord = barycoord;
  }
  return intersection;
}
class Group extends Object3D {
  constructor() {
    super();
    this.isGroup = true;
    this.type = "Group";
  }
}
class LineBasicMaterial extends Material {
  /**
   * Constructs a new line basic material.
   *
   * @param {Object} [parameters] - An object with one or more properties
   * defining the material's appearance. Any property of the material
   * (including any property from inherited materials) can be passed
   * in here. Color values can be passed any type of value accepted
   * by {@link Color#set}.
   */
  constructor(parameters) {
    super();
    this.isLineBasicMaterial = true;
    this.type = "LineBasicMaterial";
    this.color = new Color(16777215);
    this.map = null;
    this.linewidth = 1;
    this.linecap = "round";
    this.linejoin = "round";
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.map = source.map;
    this.linewidth = source.linewidth;
    this.linecap = source.linecap;
    this.linejoin = source.linejoin;
    this.fog = source.fog;
    return this;
  }
}
const _vStart = /* @__PURE__ */ new Vector3();
const _vEnd = /* @__PURE__ */ new Vector3();
const _inverseMatrix$1 = /* @__PURE__ */ new Matrix4();
const _ray$1 = /* @__PURE__ */ new Ray();
const _sphere$1 = /* @__PURE__ */ new Sphere();
const _intersectPointOnRay = /* @__PURE__ */ new Vector3();
const _intersectPointOnSegment = /* @__PURE__ */ new Vector3();
class Line extends Object3D {
  /**
   * Constructs a new line.
   *
   * @param {BufferGeometry} [geometry] - The line geometry.
   * @param {Material|Array<Material>} [material] - The line material.
   */
  constructor(geometry = new BufferGeometry(), material = new LineBasicMaterial()) {
    super();
    this.isLine = true;
    this.type = "Line";
    this.geometry = geometry;
    this.material = material;
    this.morphTargetDictionary = void 0;
    this.morphTargetInfluences = void 0;
    this.updateMorphTargets();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.material = Array.isArray(source.material) ? source.material.slice() : source.material;
    this.geometry = source.geometry;
    return this;
  }
  /**
   * Computes an array of distance values which are necessary for rendering dashed lines.
   * For each vertex in the geometry, the method calculates the cumulative length from the
   * current point to the very beginning of the line.
   *
   * @return {Line} A reference to this line.
   */
  computeLineDistances() {
    const geometry = this.geometry;
    if (geometry.index === null) {
      const positionAttribute = geometry.attributes.position;
      const lineDistances = [0];
      for (let i = 1, l2 = positionAttribute.count; i < l2; i++) {
        _vStart.fromBufferAttribute(positionAttribute, i - 1);
        _vEnd.fromBufferAttribute(positionAttribute, i);
        lineDistances[i] = lineDistances[i - 1];
        lineDistances[i] += _vStart.distanceTo(_vEnd);
      }
      geometry.setAttribute("lineDistance", new Float32BufferAttribute(lineDistances, 1));
    } else {
      warn("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");
    }
    return this;
  }
  /**
   * Computes intersection points between a casted ray and this line.
   *
   * @param {Raycaster} raycaster - The raycaster.
   * @param {Array<Object>} intersects - The target array that holds the intersection points.
   */
  raycast(raycaster, intersects) {
    const geometry = this.geometry;
    const matrixWorld = this.matrixWorld;
    const threshold = raycaster.params.Line.threshold;
    const drawRange = geometry.drawRange;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    _sphere$1.copy(geometry.boundingSphere);
    _sphere$1.applyMatrix4(matrixWorld);
    _sphere$1.radius += threshold;
    if (raycaster.ray.intersectsSphere(_sphere$1) === false) return;
    _inverseMatrix$1.copy(matrixWorld).invert();
    _ray$1.copy(raycaster.ray).applyMatrix4(_inverseMatrix$1);
    const localThreshold = threshold / ((this.scale.x + this.scale.y + this.scale.z) / 3);
    const localThresholdSq = localThreshold * localThreshold;
    const step = this.isLineSegments ? 2 : 1;
    const index2 = geometry.index;
    const attributes = geometry.attributes;
    const positionAttribute = attributes.position;
    if (index2 !== null) {
      const start = Math.max(0, drawRange.start);
      const end = Math.min(index2.count, drawRange.start + drawRange.count);
      for (let i = start, l2 = end - 1; i < l2; i += step) {
        const a2 = index2.getX(i);
        const b2 = index2.getX(i + 1);
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, a2, b2, i);
        if (intersect) {
          intersects.push(intersect);
        }
      }
      if (this.isLineLoop) {
        const a2 = index2.getX(end - 1);
        const b2 = index2.getX(start);
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, a2, b2, end - 1);
        if (intersect) {
          intersects.push(intersect);
        }
      }
    } else {
      const start = Math.max(0, drawRange.start);
      const end = Math.min(positionAttribute.count, drawRange.start + drawRange.count);
      for (let i = start, l2 = end - 1; i < l2; i += step) {
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, i, i + 1, i);
        if (intersect) {
          intersects.push(intersect);
        }
      }
      if (this.isLineLoop) {
        const intersect = checkIntersection(this, raycaster, _ray$1, localThresholdSq, end - 1, start, end - 1);
        if (intersect) {
          intersects.push(intersect);
        }
      }
    }
  }
  /**
   * Sets the values of {@link Line#morphTargetDictionary} and {@link Line#morphTargetInfluences}
   * to make sure existing morph targets can influence this 3D object.
   */
  updateMorphTargets() {
    const geometry = this.geometry;
    const morphAttributes = geometry.morphAttributes;
    const keys = Object.keys(morphAttributes);
    if (keys.length > 0) {
      const morphAttribute = morphAttributes[keys[0]];
      if (morphAttribute !== void 0) {
        this.morphTargetInfluences = [];
        this.morphTargetDictionary = {};
        for (let m = 0, ml = morphAttribute.length; m < ml; m++) {
          const name = morphAttribute[m].name || String(m);
          this.morphTargetInfluences.push(0);
          this.morphTargetDictionary[name] = m;
        }
      }
    }
  }
}
function checkIntersection(object2, raycaster, ray, thresholdSq, a2, b2, i) {
  const positionAttribute = object2.geometry.attributes.position;
  _vStart.fromBufferAttribute(positionAttribute, a2);
  _vEnd.fromBufferAttribute(positionAttribute, b2);
  const distSq = ray.distanceSqToSegment(_vStart, _vEnd, _intersectPointOnRay, _intersectPointOnSegment);
  if (distSq > thresholdSq) return;
  _intersectPointOnRay.applyMatrix4(object2.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(_intersectPointOnRay);
  if (distance < raycaster.near || distance > raycaster.far) return;
  return {
    distance,
    // What do we want? intersection point on the ray or on the segment??
    // point: raycaster.ray.at( distance ),
    point: _intersectPointOnSegment.clone().applyMatrix4(object2.matrixWorld),
    index: i,
    face: null,
    faceIndex: null,
    barycoord: null,
    object: object2
  };
}
const _start = /* @__PURE__ */ new Vector3();
const _end = /* @__PURE__ */ new Vector3();
class LineSegments extends Line {
  /**
   * Constructs a new line segments.
   *
   * @param {BufferGeometry} [geometry] - The line geometry.
   * @param {Material|Array<Material>} [material] - The line material.
   */
  constructor(geometry, material) {
    super(geometry, material);
    this.isLineSegments = true;
    this.type = "LineSegments";
  }
  computeLineDistances() {
    const geometry = this.geometry;
    if (geometry.index === null) {
      const positionAttribute = geometry.attributes.position;
      const lineDistances = [];
      for (let i = 0, l2 = positionAttribute.count; i < l2; i += 2) {
        _start.fromBufferAttribute(positionAttribute, i);
        _end.fromBufferAttribute(positionAttribute, i + 1);
        lineDistances[i] = i === 0 ? 0 : lineDistances[i - 1];
        lineDistances[i + 1] = lineDistances[i] + _start.distanceTo(_end);
      }
      geometry.setAttribute("lineDistance", new Float32BufferAttribute(lineDistances, 1));
    } else {
      warn("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");
    }
    return this;
  }
}
class PointsMaterial extends Material {
  /**
   * Constructs a new points material.
   *
   * @param {Object} [parameters] - An object with one or more properties
   * defining the material's appearance. Any property of the material
   * (including any property from inherited materials) can be passed
   * in here. Color values can be passed any type of value accepted
   * by {@link Color#set}.
   */
  constructor(parameters) {
    super();
    this.isPointsMaterial = true;
    this.type = "PointsMaterial";
    this.color = new Color(16777215);
    this.map = null;
    this.alphaMap = null;
    this.size = 1;
    this.sizeAttenuation = true;
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.map = source.map;
    this.alphaMap = source.alphaMap;
    this.size = source.size;
    this.sizeAttenuation = source.sizeAttenuation;
    this.fog = source.fog;
    return this;
  }
}
const _inverseMatrix = /* @__PURE__ */ new Matrix4();
const _ray = /* @__PURE__ */ new Ray();
const _sphere = /* @__PURE__ */ new Sphere();
const _position$2 = /* @__PURE__ */ new Vector3();
class Points extends Object3D {
  /**
   * Constructs a new point cloud.
   *
   * @param {BufferGeometry} [geometry] - The points geometry.
   * @param {Material|Array<Material>} [material] - The points material.
   */
  constructor(geometry = new BufferGeometry(), material = new PointsMaterial()) {
    super();
    this.isPoints = true;
    this.type = "Points";
    this.geometry = geometry;
    this.material = material;
    this.morphTargetDictionary = void 0;
    this.morphTargetInfluences = void 0;
    this.updateMorphTargets();
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.material = Array.isArray(source.material) ? source.material.slice() : source.material;
    this.geometry = source.geometry;
    return this;
  }
  /**
   * Computes intersection points between a casted ray and this point cloud.
   *
   * @param {Raycaster} raycaster - The raycaster.
   * @param {Array<Object>} intersects - The target array that holds the intersection points.
   */
  raycast(raycaster, intersects) {
    const geometry = this.geometry;
    const matrixWorld = this.matrixWorld;
    const threshold = raycaster.params.Points.threshold;
    const drawRange = geometry.drawRange;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    _sphere.copy(geometry.boundingSphere);
    _sphere.applyMatrix4(matrixWorld);
    _sphere.radius += threshold;
    if (raycaster.ray.intersectsSphere(_sphere) === false) return;
    _inverseMatrix.copy(matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inverseMatrix);
    const localThreshold = threshold / ((this.scale.x + this.scale.y + this.scale.z) / 3);
    const localThresholdSq = localThreshold * localThreshold;
    const index2 = geometry.index;
    const attributes = geometry.attributes;
    const positionAttribute = attributes.position;
    if (index2 !== null) {
      const start = Math.max(0, drawRange.start);
      const end = Math.min(index2.count, drawRange.start + drawRange.count);
      for (let i = start, il = end; i < il; i++) {
        const a2 = index2.getX(i);
        _position$2.fromBufferAttribute(positionAttribute, a2);
        testPoint(_position$2, a2, localThresholdSq, matrixWorld, raycaster, intersects, this);
      }
    } else {
      const start = Math.max(0, drawRange.start);
      const end = Math.min(positionAttribute.count, drawRange.start + drawRange.count);
      for (let i = start, l2 = end; i < l2; i++) {
        _position$2.fromBufferAttribute(positionAttribute, i);
        testPoint(_position$2, i, localThresholdSq, matrixWorld, raycaster, intersects, this);
      }
    }
  }
  /**
   * Sets the values of {@link Points#morphTargetDictionary} and {@link Points#morphTargetInfluences}
   * to make sure existing morph targets can influence this 3D object.
   */
  updateMorphTargets() {
    const geometry = this.geometry;
    const morphAttributes = geometry.morphAttributes;
    const keys = Object.keys(morphAttributes);
    if (keys.length > 0) {
      const morphAttribute = morphAttributes[keys[0]];
      if (morphAttribute !== void 0) {
        this.morphTargetInfluences = [];
        this.morphTargetDictionary = {};
        for (let m = 0, ml = morphAttribute.length; m < ml; m++) {
          const name = morphAttribute[m].name || String(m);
          this.morphTargetInfluences.push(0);
          this.morphTargetDictionary[name] = m;
        }
      }
    }
  }
}
function testPoint(point, index2, localThresholdSq, matrixWorld, raycaster, intersects, object2) {
  const rayPointDistanceSq = _ray.distanceSqToPoint(point);
  if (rayPointDistanceSq < localThresholdSq) {
    const intersectPoint = new Vector3();
    _ray.closestPointToPoint(point, intersectPoint);
    intersectPoint.applyMatrix4(matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(intersectPoint);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({
      distance,
      distanceToRay: Math.sqrt(rayPointDistanceSq),
      point: intersectPoint,
      index: index2,
      face: null,
      faceIndex: null,
      barycoord: null,
      object: object2
    });
  }
}
class MeshPhongMaterial extends Material {
  /**
   * Constructs a new mesh phong material.
   *
   * @param {Object} [parameters] - An object with one or more properties
   * defining the material's appearance. Any property of the material
   * (including any property from inherited materials) can be passed
   * in here. Color values can be passed any type of value accepted
   * by {@link Color#set}.
   */
  constructor(parameters) {
    super();
    this.isMeshPhongMaterial = true;
    this.type = "MeshPhongMaterial";
    this.color = new Color(16777215);
    this.specular = new Color(1118481);
    this.shininess = 30;
    this.map = null;
    this.lightMap = null;
    this.lightMapIntensity = 1;
    this.aoMap = null;
    this.aoMapIntensity = 1;
    this.emissive = new Color(0);
    this.emissiveIntensity = 1;
    this.emissiveMap = null;
    this.bumpMap = null;
    this.bumpScale = 1;
    this.normalMap = null;
    this.normalMapType = TangentSpaceNormalMap;
    this.normalScale = new Vector2(1, 1);
    this.displacementMap = null;
    this.displacementScale = 1;
    this.displacementBias = 0;
    this.specularMap = null;
    this.alphaMap = null;
    this.envMap = null;
    this.envMapRotation = new Euler();
    this.combine = MultiplyOperation;
    this.reflectivity = 1;
    this.refractionRatio = 0.98;
    this.wireframe = false;
    this.wireframeLinewidth = 1;
    this.wireframeLinecap = "round";
    this.wireframeLinejoin = "round";
    this.flatShading = false;
    this.fog = true;
    this.setValues(parameters);
  }
  copy(source) {
    super.copy(source);
    this.color.copy(source.color);
    this.specular.copy(source.specular);
    this.shininess = source.shininess;
    this.map = source.map;
    this.lightMap = source.lightMap;
    this.lightMapIntensity = source.lightMapIntensity;
    this.aoMap = source.aoMap;
    this.aoMapIntensity = source.aoMapIntensity;
    this.emissive.copy(source.emissive);
    this.emissiveMap = source.emissiveMap;
    this.emissiveIntensity = source.emissiveIntensity;
    this.bumpMap = source.bumpMap;
    this.bumpScale = source.bumpScale;
    this.normalMap = source.normalMap;
    this.normalMapType = source.normalMapType;
    this.normalScale.copy(source.normalScale);
    this.displacementMap = source.displacementMap;
    this.displacementScale = source.displacementScale;
    this.displacementBias = source.displacementBias;
    this.specularMap = source.specularMap;
    this.alphaMap = source.alphaMap;
    this.envMap = source.envMap;
    this.envMapRotation.copy(source.envMapRotation);
    this.combine = source.combine;
    this.reflectivity = source.reflectivity;
    this.refractionRatio = source.refractionRatio;
    this.wireframe = source.wireframe;
    this.wireframeLinewidth = source.wireframeLinewidth;
    this.wireframeLinecap = source.wireframeLinecap;
    this.wireframeLinejoin = source.wireframeLinejoin;
    this.flatShading = source.flatShading;
    this.fog = source.fog;
    return this;
  }
}
const Cache = {
  /**
   * Whether caching is enabled or not.
   *
   * @static
   * @type {boolean}
   * @default false
   */
  enabled: false,
  /**
   * A dictionary that holds cached files.
   *
   * @static
   * @type {Object<string,Object>}
   */
  files: {},
  /**
   * Adds a cache entry with a key to reference the file. If this key already
   * holds a file, it is overwritten.
   *
   * @static
   * @param {string} key - The key to reference the cached file.
   * @param {Object} file -  The file to be cached.
   */
  add: function(key, file) {
    if (this.enabled === false) return;
    this.files[key] = file;
  },
  /**
   * Gets the cached value for the given key.
   *
   * @static
   * @param {string} key - The key to reference the cached file.
   * @return {Object|undefined} The cached file. If the key does not exist `undefined` is returned.
   */
  get: function(key) {
    if (this.enabled === false) return;
    return this.files[key];
  },
  /**
   * Removes the cached file associated with the given key.
   *
   * @static
   * @param {string} key - The key to reference the cached file.
   */
  remove: function(key) {
    delete this.files[key];
  },
  /**
   * Remove all values from the cache.
   *
   * @static
   */
  clear: function() {
    this.files = {};
  }
};
class LoadingManager {
  /**
   * Constructs a new loading manager.
   *
   * @param {Function} [onLoad] - Executes when all items have been loaded.
   * @param {Function} [onProgress] - Executes when single items have been loaded.
   * @param {Function} [onError] - Executes when an error occurs.
   */
  constructor(onLoad, onProgress, onError) {
    const scope = this;
    let isLoading = false;
    let itemsLoaded = 0;
    let itemsTotal = 0;
    let urlModifier = void 0;
    const handlers = [];
    this.onStart = void 0;
    this.onLoad = onLoad;
    this.onProgress = onProgress;
    this.onError = onError;
    this._abortController = null;
    this.itemStart = function(url) {
      itemsTotal++;
      if (isLoading === false) {
        if (scope.onStart !== void 0) {
          scope.onStart(url, itemsLoaded, itemsTotal);
        }
      }
      isLoading = true;
    };
    this.itemEnd = function(url) {
      itemsLoaded++;
      if (scope.onProgress !== void 0) {
        scope.onProgress(url, itemsLoaded, itemsTotal);
      }
      if (itemsLoaded === itemsTotal) {
        isLoading = false;
        if (scope.onLoad !== void 0) {
          scope.onLoad();
        }
      }
    };
    this.itemError = function(url) {
      if (scope.onError !== void 0) {
        scope.onError(url);
      }
    };
    this.resolveURL = function(url) {
      if (urlModifier) {
        return urlModifier(url);
      }
      return url;
    };
    this.setURLModifier = function(transform) {
      urlModifier = transform;
      return this;
    };
    this.addHandler = function(regex, loader) {
      handlers.push(regex, loader);
      return this;
    };
    this.removeHandler = function(regex) {
      const index2 = handlers.indexOf(regex);
      if (index2 !== -1) {
        handlers.splice(index2, 2);
      }
      return this;
    };
    this.getHandler = function(file) {
      for (let i = 0, l2 = handlers.length; i < l2; i += 2) {
        const regex = handlers[i];
        const loader = handlers[i + 1];
        if (regex.global) regex.lastIndex = 0;
        if (regex.test(file)) {
          return loader;
        }
      }
      return null;
    };
    this.abort = function() {
      this.abortController.abort();
      this._abortController = null;
      return this;
    };
  }
  // TODO: Revert this back to a single member variable once this issue has been fixed
  // https://github.com/cloudflare/workerd/issues/3657
  /**
   * Used for aborting ongoing requests in loaders using this manager.
   *
   * @type {AbortController}
   */
  get abortController() {
    if (!this._abortController) {
      this._abortController = new AbortController();
    }
    return this._abortController;
  }
}
const DefaultLoadingManager = /* @__PURE__ */ new LoadingManager();
class Loader {
  /**
   * Constructs a new loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    this.manager = manager !== void 0 ? manager : DefaultLoadingManager;
    this.crossOrigin = "anonymous";
    this.withCredentials = false;
    this.path = "";
    this.resourcePath = "";
    this.requestHeader = {};
  }
  /**
   * This method needs to be implemented by all concrete loaders. It holds the
   * logic for loading assets from the backend.
   *
   * @abstract
   * @param {string} url - The path/URL of the file to be loaded.
   * @param {Function} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} [onProgress] - Executed while the loading is in progress.
   * @param {onErrorCallback} [onError] - Executed when errors occur.
   */
  load() {
  }
  /**
   * A async version of {@link Loader#load}.
   *
   * @param {string} url - The path/URL of the file to be loaded.
   * @param {onProgressCallback} [onProgress] - Executed while the loading is in progress.
   * @return {Promise} A Promise that resolves when the asset has been loaded.
   */
  loadAsync(url, onProgress) {
    const scope = this;
    return new Promise(function(resolve, reject) {
      scope.load(url, resolve, onProgress, reject);
    });
  }
  /**
   * This method needs to be implemented by all concrete loaders. It holds the
   * logic for parsing the asset into three.js entities.
   *
   * @abstract
   * @param {any} data - The data to parse.
   */
  parse() {
  }
  /**
   * Sets the `crossOrigin` String to implement CORS for loading the URL
   * from a different domain that allows CORS.
   *
   * @param {string} crossOrigin - The `crossOrigin` value.
   * @return {Loader} A reference to this instance.
   */
  setCrossOrigin(crossOrigin) {
    this.crossOrigin = crossOrigin;
    return this;
  }
  /**
   * Whether the XMLHttpRequest uses credentials such as cookies, authorization
   * headers or TLS client certificates, see [XMLHttpRequest.withCredentials](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials).
   *
   * Note: This setting has no effect if you are loading files locally or from the same domain.
   *
   * @param {boolean} value - The `withCredentials` value.
   * @return {Loader} A reference to this instance.
   */
  setWithCredentials(value) {
    this.withCredentials = value;
    return this;
  }
  /**
   * Sets the base path for the asset.
   *
   * @param {string} path - The base path.
   * @return {Loader} A reference to this instance.
   */
  setPath(path) {
    this.path = path;
    return this;
  }
  /**
   * Sets the base path for dependent resources like textures.
   *
   * @param {string} resourcePath - The resource path.
   * @return {Loader} A reference to this instance.
   */
  setResourcePath(resourcePath) {
    this.resourcePath = resourcePath;
    return this;
  }
  /**
   * Sets the given request header.
   *
   * @param {Object} requestHeader - A [request header](https://developer.mozilla.org/en-US/docs/Glossary/Request_header)
   * for configuring the HTTP request.
   * @return {Loader} A reference to this instance.
   */
  setRequestHeader(requestHeader) {
    this.requestHeader = requestHeader;
    return this;
  }
  /**
   * This method can be implemented in loaders for aborting ongoing requests.
   *
   * @abstract
   * @return {Loader} A reference to this instance.
   */
  abort() {
    return this;
  }
}
Loader.DEFAULT_MATERIAL_NAME = "__DEFAULT";
const loading = {};
class HttpError extends Error {
  constructor(message, response) {
    super(message);
    this.response = response;
  }
}
class FileLoader extends Loader {
  /**
   * Constructs a new file loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
    this.mimeType = "";
    this.responseType = "";
    this._abortController = new AbortController();
  }
  /**
   * Starts loading from the given URL and pass the loaded response to the `onLoad()` callback.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(any)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} [onProgress] - Executed while the loading is in progress.
   * @param {onErrorCallback} [onError] - Executed when errors occur.
   * @return {any|undefined} The cached resource if available.
   */
  load(url, onLoad, onProgress, onError) {
    if (url === void 0) url = "";
    if (this.path !== void 0) url = this.path + url;
    url = this.manager.resolveURL(url);
    const cached = Cache.get(`file:${url}`);
    if (cached !== void 0) {
      this.manager.itemStart(url);
      setTimeout(() => {
        if (onLoad) onLoad(cached);
        this.manager.itemEnd(url);
      }, 0);
      return cached;
    }
    if (loading[url] !== void 0) {
      loading[url].push({
        onLoad,
        onProgress,
        onError
      });
      return;
    }
    loading[url] = [];
    loading[url].push({
      onLoad,
      onProgress,
      onError
    });
    const req = new Request(url, {
      headers: new Headers(this.requestHeader),
      credentials: this.withCredentials ? "include" : "same-origin",
      signal: typeof AbortSignal.any === "function" ? AbortSignal.any([this._abortController.signal, this.manager.abortController.signal]) : this._abortController.signal
    });
    const mimeType = this.mimeType;
    const responseType = this.responseType;
    fetch(req).then((response) => {
      if (response.status === 200 || response.status === 0) {
        if (response.status === 0) {
          warn("FileLoader: HTTP Status 0 received.");
        }
        if (typeof ReadableStream === "undefined" || response.body === void 0 || response.body.getReader === void 0) {
          return response;
        }
        const callbacks = loading[url];
        const reader = response.body.getReader();
        const contentLength = response.headers.get("X-File-Size") || response.headers.get("Content-Length");
        const total = contentLength ? parseInt(contentLength) : 0;
        const lengthComputable = total !== 0;
        let loaded = 0;
        const stream2 = new ReadableStream({
          start(controller) {
            readData();
            function readData() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  controller.close();
                } else {
                  loaded += value.byteLength;
                  const event = new ProgressEvent("progress", { lengthComputable, loaded, total });
                  for (let i = 0, il = callbacks.length; i < il; i++) {
                    const callback = callbacks[i];
                    if (callback.onProgress) callback.onProgress(event);
                  }
                  controller.enqueue(value);
                  readData();
                }
              }, (e2) => {
                controller.error(e2);
              });
            }
          }
        });
        return new Response(stream2);
      } else {
        throw new HttpError(`fetch for "${response.url}" responded with ${response.status}: ${response.statusText}`, response);
      }
    }).then((response) => {
      switch (responseType) {
        case "arraybuffer":
          return response.arrayBuffer();
        case "blob":
          return response.blob();
        case "document":
          return response.text().then((text) => {
            const parser = new DOMParser();
            return parser.parseFromString(text, mimeType);
          });
        case "json":
          return response.json();
        default:
          if (mimeType === "") {
            return response.text();
          } else {
            const re = /charset="?([^;"\s]*)"?/i;
            const exec = re.exec(mimeType);
            const label = exec && exec[1] ? exec[1].toLowerCase() : void 0;
            const decoder = new TextDecoder(label);
            return response.arrayBuffer().then((ab) => decoder.decode(ab));
          }
      }
    }).then((data) => {
      Cache.add(`file:${url}`, data);
      const callbacks = loading[url];
      delete loading[url];
      for (let i = 0, il = callbacks.length; i < il; i++) {
        const callback = callbacks[i];
        if (callback.onLoad) callback.onLoad(data);
      }
    }).catch((err2) => {
      const callbacks = loading[url];
      if (callbacks === void 0) {
        this.manager.itemError(url);
        throw err2;
      }
      delete loading[url];
      for (let i = 0, il = callbacks.length; i < il; i++) {
        const callback = callbacks[i];
        if (callback.onError) callback.onError(err2);
      }
      this.manager.itemError(url);
    }).finally(() => {
      this.manager.itemEnd(url);
    });
    this.manager.itemStart(url);
  }
  /**
   * Sets the expected response type.
   *
   * @param {('arraybuffer'|'blob'|'document'|'json'|'')} value - The response type.
   * @return {FileLoader} A reference to this file loader.
   */
  setResponseType(value) {
    this.responseType = value;
    return this;
  }
  /**
   * Sets the expected mime type of the loaded file.
   *
   * @param {string} value - The mime type.
   * @return {FileLoader} A reference to this file loader.
   */
  setMimeType(value) {
    this.mimeType = value;
    return this;
  }
  /**
   * Aborts ongoing fetch requests.
   *
   * @return {FileLoader} A reference to this instance.
   */
  abort() {
    this._abortController.abort();
    this._abortController = new AbortController();
    return this;
  }
}
const _loading = /* @__PURE__ */ new WeakMap();
class ImageLoader extends Loader {
  /**
   * Constructs a new image loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
  }
  /**
   * Starts loading from the given URL and passes the loaded image
   * to the `onLoad()` callback. The method also returns a new `Image` object which can
   * directly be used for texture creation. If you do it this way, the texture
   * may pop up in your scene once the respective loading process is finished.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(Image)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Unsupported in this loader.
   * @param {onErrorCallback} onError - Executed when errors occur.
   * @return {Image} The image.
   */
  load(url, onLoad, onProgress, onError) {
    if (this.path !== void 0) url = this.path + url;
    url = this.manager.resolveURL(url);
    const scope = this;
    const cached = Cache.get(`image:${url}`);
    if (cached !== void 0) {
      if (cached.complete === true) {
        scope.manager.itemStart(url);
        setTimeout(function() {
          if (onLoad) onLoad(cached);
          scope.manager.itemEnd(url);
        }, 0);
      } else {
        let arr = _loading.get(cached);
        if (arr === void 0) {
          arr = [];
          _loading.set(cached, arr);
        }
        arr.push({ onLoad, onError });
      }
      return cached;
    }
    const image = createElementNS("img");
    function onImageLoad() {
      removeEventListeners();
      if (onLoad) onLoad(this);
      const callbacks = _loading.get(this) || [];
      for (let i = 0; i < callbacks.length; i++) {
        const callback = callbacks[i];
        if (callback.onLoad) callback.onLoad(this);
      }
      _loading.delete(this);
      scope.manager.itemEnd(url);
    }
    function onImageError(event) {
      removeEventListeners();
      if (onError) onError(event);
      Cache.remove(`image:${url}`);
      const callbacks = _loading.get(this) || [];
      for (let i = 0; i < callbacks.length; i++) {
        const callback = callbacks[i];
        if (callback.onError) callback.onError(event);
      }
      _loading.delete(this);
      scope.manager.itemError(url);
      scope.manager.itemEnd(url);
    }
    function removeEventListeners() {
      image.removeEventListener("load", onImageLoad, false);
      image.removeEventListener("error", onImageError, false);
    }
    image.addEventListener("load", onImageLoad, false);
    image.addEventListener("error", onImageError, false);
    if (url.slice(0, 5) !== "data:") {
      if (this.crossOrigin !== void 0) image.crossOrigin = this.crossOrigin;
    }
    Cache.add(`image:${url}`, image);
    scope.manager.itemStart(url);
    image.src = url;
    return image;
  }
}
class TextureLoader extends Loader {
  /**
   * Constructs a new texture loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
  }
  /**
   * Starts loading from the given URL and pass the fully loaded texture
   * to the `onLoad()` callback. The method also returns a new texture object which can
   * directly be used for material creation. If you do it this way, the texture
   * may pop up in your scene once the respective loading process is finished.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(Texture)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Unsupported in this loader.
   * @param {onErrorCallback} onError - Executed when errors occur.
   * @return {Texture} The texture.
   */
  load(url, onLoad, onProgress, onError) {
    const texture = new Texture();
    const loader = new ImageLoader(this.manager);
    loader.setCrossOrigin(this.crossOrigin);
    loader.setPath(this.path);
    loader.load(url, function(image) {
      texture.image = image;
      texture.needsUpdate = true;
      if (onLoad !== void 0) {
        onLoad(texture);
      }
    }, onProgress, onError);
    return texture;
  }
}
class LoaderUtils {
  /**
   * Extracts the base URL from the given URL.
   *
   * @param {string} url -The URL to extract the base URL from.
   * @return {string} The extracted base URL.
   */
  static extractUrlBase(url) {
    const index2 = url.lastIndexOf("/");
    if (index2 === -1) return "./";
    return url.slice(0, index2 + 1);
  }
  /**
   * Resolves relative URLs against the given path. Absolute paths, data urls,
   * and blob URLs will be returned as is. Invalid URLs will return an empty
   * string.
   *
   * @param {string} url -The URL to resolve.
   * @param {string} path - The base path for relative URLs to be resolved against.
   * @return {string} The resolved URL.
   */
  static resolveURL(url, path) {
    if (typeof url !== "string" || url === "") return "";
    if (/^https?:\/\//i.test(path) && /^\//.test(url)) {
      path = path.replace(/(^https?:\/\/[^\/]+).*/i, "$1");
    }
    if (/^(https?:)?\/\//i.test(url)) return url;
    if (/^data:.*,.*$/i.test(url)) return url;
    if (/^blob:.*$/i.test(url)) return url;
    return path + url;
  }
}
if (typeof __THREE_DEVTOOLS__ !== "undefined") {
  __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register", { detail: {
    revision: REVISION
  } }));
}
if (typeof window !== "undefined") {
  if (window.__THREE__) {
    warn("WARNING: Multiple instances of Three.js being imported.");
  } else {
    window.__THREE__ = REVISION;
  }
}
class STLLoader extends Loader {
  /**
   * Constructs a new STL loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
  }
  /**
   * Starts loading from the given URL and passes the loaded STL asset
   * to the `onLoad()` callback.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(BufferGeometry)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
   * @param {onErrorCallback} onError - Executed when errors occur.
   */
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(url, function(text) {
      try {
        onLoad(scope.parse(text));
      } catch (e2) {
        if (onError) {
          onError(e2);
        } else {
          console.error(e2);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }
  /**
   * Parses the given STL data and returns the resulting geometry.
   *
   * @param {ArrayBuffer} data - The raw STL data as an array buffer.
   * @return {BufferGeometry} The parsed geometry.
   */
  parse(data) {
    function isBinary(data2) {
      const reader = new DataView(data2);
      const face_size = 32 / 8 * 3 + 32 / 8 * 3 * 3 + 16 / 8;
      const n_faces = reader.getUint32(80, true);
      const expect = 80 + 32 / 8 + n_faces * face_size;
      if (expect === reader.byteLength) {
        return true;
      }
      const solid = [115, 111, 108, 105, 100];
      for (let off = 0; off < 5; off++) {
        if (matchDataViewAt(solid, reader, off)) return false;
      }
      return true;
    }
    function matchDataViewAt(query, reader, offset) {
      for (let i = 0, il = query.length; i < il; i++) {
        if (query[i] !== reader.getUint8(offset + i)) return false;
      }
      return true;
    }
    function parseBinary(data2) {
      const reader = new DataView(data2);
      const faces = reader.getUint32(80, true);
      let r2, g, b2, hasColors = false, colors;
      let defaultR, defaultG, defaultB, alpha;
      for (let index2 = 0; index2 < 80 - 10; index2++) {
        if (reader.getUint32(index2, false) == 1129270351 && reader.getUint8(index2 + 4) == 82 && reader.getUint8(index2 + 5) == 61) {
          hasColors = true;
          colors = new Float32Array(faces * 3 * 3);
          defaultR = reader.getUint8(index2 + 6) / 255;
          defaultG = reader.getUint8(index2 + 7) / 255;
          defaultB = reader.getUint8(index2 + 8) / 255;
          alpha = reader.getUint8(index2 + 9) / 255;
        }
      }
      const dataOffset = 84;
      const faceLength = 12 * 4 + 2;
      const geometry = new BufferGeometry();
      const vertices = new Float32Array(faces * 3 * 3);
      const normals = new Float32Array(faces * 3 * 3);
      const color = new Color();
      for (let face = 0; face < faces; face++) {
        const start = dataOffset + face * faceLength;
        const normalX = reader.getFloat32(start, true);
        const normalY = reader.getFloat32(start + 4, true);
        const normalZ = reader.getFloat32(start + 8, true);
        if (hasColors) {
          const packedColor = reader.getUint16(start + 48, true);
          if ((packedColor & 32768) === 0) {
            r2 = (packedColor & 31) / 31;
            g = (packedColor >> 5 & 31) / 31;
            b2 = (packedColor >> 10 & 31) / 31;
          } else {
            r2 = defaultR;
            g = defaultG;
            b2 = defaultB;
          }
        }
        for (let i = 1; i <= 3; i++) {
          const vertexstart = start + i * 12;
          const componentIdx = face * 3 * 3 + (i - 1) * 3;
          vertices[componentIdx] = reader.getFloat32(vertexstart, true);
          vertices[componentIdx + 1] = reader.getFloat32(vertexstart + 4, true);
          vertices[componentIdx + 2] = reader.getFloat32(vertexstart + 8, true);
          normals[componentIdx] = normalX;
          normals[componentIdx + 1] = normalY;
          normals[componentIdx + 2] = normalZ;
          if (hasColors) {
            color.setRGB(r2, g, b2, SRGBColorSpace);
            colors[componentIdx] = color.r;
            colors[componentIdx + 1] = color.g;
            colors[componentIdx + 2] = color.b;
          }
        }
      }
      geometry.setAttribute("position", new BufferAttribute(vertices, 3));
      geometry.setAttribute("normal", new BufferAttribute(normals, 3));
      if (hasColors) {
        geometry.setAttribute("color", new BufferAttribute(colors, 3));
        geometry.hasColors = true;
        geometry.alpha = alpha;
      }
      return geometry;
    }
    function parseASCII(data2) {
      const geometry = new BufferGeometry();
      const patternSolid = /solid([\s\S]*?)endsolid/g;
      const patternFace = /facet([\s\S]*?)endfacet/g;
      const patternName = /solid\s(.+)/;
      let faceCounter = 0;
      const patternFloat = /[\s]+([+-]?(?:\d*)(?:\.\d*)?(?:[eE][+-]?\d+)?)/.source;
      const patternVertex = new RegExp("vertex" + patternFloat + patternFloat + patternFloat, "g");
      const patternNormal = new RegExp("normal" + patternFloat + patternFloat + patternFloat, "g");
      const vertices = [];
      const normals = [];
      const groupNames = [];
      const normal = new Vector3();
      let result;
      let groupCount = 0;
      let startVertex = 0;
      let endVertex = 0;
      while ((result = patternSolid.exec(data2)) !== null) {
        startVertex = endVertex;
        const solid = result[0];
        const name = (result = patternName.exec(solid)) !== null ? result[1] : "";
        groupNames.push(name);
        while ((result = patternFace.exec(solid)) !== null) {
          let vertexCountPerFace = 0;
          let normalCountPerFace = 0;
          const text = result[0];
          while ((result = patternNormal.exec(text)) !== null) {
            normal.x = parseFloat(result[1]);
            normal.y = parseFloat(result[2]);
            normal.z = parseFloat(result[3]);
            normalCountPerFace++;
          }
          while ((result = patternVertex.exec(text)) !== null) {
            vertices.push(parseFloat(result[1]), parseFloat(result[2]), parseFloat(result[3]));
            normals.push(normal.x, normal.y, normal.z);
            vertexCountPerFace++;
            endVertex++;
          }
          if (normalCountPerFace !== 1) {
            console.error("THREE.STLLoader: Something isn't right with the normal of face number " + faceCounter);
          }
          if (vertexCountPerFace !== 3) {
            console.error("THREE.STLLoader: Something isn't right with the vertices of face number " + faceCounter);
          }
          faceCounter++;
        }
        const start = startVertex;
        const count = endVertex - startVertex;
        geometry.userData.groupNames = groupNames;
        geometry.addGroup(start, count, groupCount);
        groupCount++;
      }
      geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
      geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
      return geometry;
    }
    function ensureString(buffer) {
      if (typeof buffer !== "string") {
        return new TextDecoder().decode(buffer);
      }
      return buffer;
    }
    function ensureBinary(buffer) {
      if (typeof buffer === "string") {
        const array_buffer = new Uint8Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
          array_buffer[i] = buffer.charCodeAt(i) & 255;
        }
        return array_buffer.buffer || array_buffer;
      } else {
        return buffer;
      }
    }
    const binData = ensureBinary(data);
    return isBinary(binData) ? parseBinary(binData) : parseASCII(ensureString(data));
  }
}
const _color$1 = new Color();
class PLYLoader extends Loader {
  /**
   * Constructs a new PLY loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
    this.propertyNameMapping = {};
    this.customPropertyMapping = {};
  }
  /**
   * Starts loading from the given URL and passes the loaded PLY asset
   * to the `onLoad()` callback.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(BufferGeometry)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
   * @param {onErrorCallback} onError - Executed when errors occur.
   */
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(url, function(text) {
      try {
        onLoad(scope.parse(text));
      } catch (e2) {
        if (onError) {
          onError(e2);
        } else {
          console.error(e2);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }
  /**
   * Sets a property name mapping that maps default property names
   * to custom ones. For example, the following maps the properties
   * “diffuse_(red|green|blue)” in the file to standard color names.
   *
   * ```js
   * loader.setPropertyNameMapping( {
   * 	diffuse_red: 'red',
   * 	diffuse_green: 'green',
   * 	diffuse_blue: 'blue'
   * } );
   * ```
   *
   * @param {Object} mapping - The mapping dictionary.
   */
  setPropertyNameMapping(mapping) {
    this.propertyNameMapping = mapping;
  }
  /**
   * Custom properties outside of the defaults for position, uv, normal
   * and color attributes can be added using the setCustomPropertyNameMapping method.
   * For example, the following maps the element properties “custom_property_a”
   * and “custom_property_b” to an attribute “customAttribute” with an item size of 2.
   * Attribute item sizes are set from the number of element properties in the property array.
   *
   * ```js
   * loader.setCustomPropertyNameMapping( {
   *	customAttribute: ['custom_property_a', 'custom_property_b'],
   * } );
   * ```
   * @param {Object} mapping - The mapping dictionary.
   */
  setCustomPropertyNameMapping(mapping) {
    this.customPropertyMapping = mapping;
  }
  /**
   * Parses the given PLY data and returns the resulting geometry.
   *
   * @param {ArrayBuffer} data - The raw PLY data as an array buffer.
   * @return {BufferGeometry} The parsed geometry.
   */
  parse(data) {
    function parseHeader(data2, headerLength = 0) {
      const patternHeader = /^ply([\s\S]*)end_header(\r\n|\r|\n)/;
      let headerText = "";
      const result = patternHeader.exec(data2);
      if (result !== null) {
        headerText = result[1];
      }
      const header = {
        comments: [],
        elements: [],
        headerLength,
        objInfo: ""
      };
      const lines = headerText.split(/\r\n|\r|\n/);
      let currentElement;
      function make_ply_element_property(propertyValues, propertyNameMapping) {
        const property = { type: propertyValues[0] };
        if (property.type === "list") {
          property.name = propertyValues[3];
          property.countType = propertyValues[1];
          property.itemType = propertyValues[2];
        } else {
          property.name = propertyValues[1];
        }
        if (property.name in propertyNameMapping) {
          property.name = propertyNameMapping[property.name];
        }
        return property;
      }
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        line = line.trim();
        if (line === "") continue;
        const lineValues = line.split(/\s+/);
        const lineType = lineValues.shift();
        line = lineValues.join(" ");
        switch (lineType) {
          case "format":
            header.format = lineValues[0];
            header.version = lineValues[1];
            break;
          case "comment":
            header.comments.push(line);
            break;
          case "element":
            if (currentElement !== void 0) {
              header.elements.push(currentElement);
            }
            currentElement = {};
            currentElement.name = lineValues[0];
            currentElement.count = parseInt(lineValues[1]);
            currentElement.properties = [];
            break;
          case "property":
            currentElement.properties.push(make_ply_element_property(lineValues, scope.propertyNameMapping));
            break;
          case "obj_info":
            header.objInfo = line;
            break;
          default:
            console.log("unhandled", lineType, lineValues);
        }
      }
      if (currentElement !== void 0) {
        header.elements.push(currentElement);
      }
      return header;
    }
    function parseASCIINumber(n2, type) {
      switch (type) {
        case "char":
        case "uchar":
        case "short":
        case "ushort":
        case "int":
        case "uint":
        case "int8":
        case "uint8":
        case "int16":
        case "uint16":
        case "int32":
        case "uint32":
          return parseInt(n2);
        case "float":
        case "double":
        case "float32":
        case "float64":
          return parseFloat(n2);
      }
    }
    function parseASCIIElement(properties, tokens) {
      const element = {};
      for (let i = 0; i < properties.length; i++) {
        if (tokens.empty()) return null;
        if (properties[i].type === "list") {
          const list = [];
          const n2 = parseASCIINumber(tokens.next(), properties[i].countType);
          for (let j = 0; j < n2; j++) {
            if (tokens.empty()) return null;
            list.push(parseASCIINumber(tokens.next(), properties[i].itemType));
          }
          element[properties[i].name] = list;
        } else {
          element[properties[i].name] = parseASCIINumber(tokens.next(), properties[i].type);
        }
      }
      return element;
    }
    function createBuffer() {
      const buffer = {
        indices: [],
        vertices: [],
        normals: [],
        uvs: [],
        faceVertexUvs: [],
        colors: [],
        faceVertexColors: []
      };
      for (const customProperty of Object.keys(scope.customPropertyMapping)) {
        buffer[customProperty] = [];
      }
      return buffer;
    }
    function mapElementAttributes(properties) {
      const elementNames = properties.map((property) => {
        return property.name;
      });
      function findAttrName(names) {
        for (let i = 0, l2 = names.length; i < l2; i++) {
          const name = names[i];
          if (elementNames.includes(name)) return name;
        }
        return null;
      }
      return {
        attrX: findAttrName(["x", "px", "posx"]) || "x",
        attrY: findAttrName(["y", "py", "posy"]) || "y",
        attrZ: findAttrName(["z", "pz", "posz"]) || "z",
        attrNX: findAttrName(["nx", "normalx"]),
        attrNY: findAttrName(["ny", "normaly"]),
        attrNZ: findAttrName(["nz", "normalz"]),
        attrS: findAttrName(["s", "u", "texture_u", "tx"]),
        attrT: findAttrName(["t", "v", "texture_v", "ty"]),
        attrR: findAttrName(["red", "diffuse_red", "r", "diffuse_r"]),
        attrG: findAttrName(["green", "diffuse_green", "g", "diffuse_g"]),
        attrB: findAttrName(["blue", "diffuse_blue", "b", "diffuse_b"])
      };
    }
    function parseASCII(data2, header) {
      const buffer = createBuffer();
      const patternBody = /end_header\s+(\S[\s\S]*\S|\S)\s*$/;
      let body, matches;
      if ((matches = patternBody.exec(data2)) !== null) {
        body = matches[1].split(/\s+/);
      } else {
        body = [];
      }
      const tokens = new ArrayStream(body);
      loop: for (let i = 0; i < header.elements.length; i++) {
        const elementDesc = header.elements[i];
        const attributeMap = mapElementAttributes(elementDesc.properties);
        for (let j = 0; j < elementDesc.count; j++) {
          const element = parseASCIIElement(elementDesc.properties, tokens);
          if (!element) break loop;
          handleElement(buffer, elementDesc.name, element, attributeMap);
        }
      }
      return postProcess(buffer);
    }
    function postProcess(buffer) {
      let geometry2 = new BufferGeometry();
      if (buffer.indices.length > 0) {
        geometry2.setIndex(buffer.indices);
      }
      geometry2.setAttribute("position", new Float32BufferAttribute(buffer.vertices, 3));
      if (buffer.normals.length > 0) {
        geometry2.setAttribute("normal", new Float32BufferAttribute(buffer.normals, 3));
      }
      if (buffer.uvs.length > 0) {
        geometry2.setAttribute("uv", new Float32BufferAttribute(buffer.uvs, 2));
      }
      if (buffer.colors.length > 0) {
        geometry2.setAttribute("color", new Float32BufferAttribute(buffer.colors, 3));
      }
      if (buffer.faceVertexUvs.length > 0 || buffer.faceVertexColors.length > 0) {
        geometry2 = geometry2.toNonIndexed();
        if (buffer.faceVertexUvs.length > 0) geometry2.setAttribute("uv", new Float32BufferAttribute(buffer.faceVertexUvs, 2));
        if (buffer.faceVertexColors.length > 0) geometry2.setAttribute("color", new Float32BufferAttribute(buffer.faceVertexColors, 3));
      }
      for (const customProperty of Object.keys(scope.customPropertyMapping)) {
        if (buffer[customProperty].length > 0) {
          geometry2.setAttribute(
            customProperty,
            new Float32BufferAttribute(
              buffer[customProperty],
              scope.customPropertyMapping[customProperty].length
            )
          );
        }
      }
      geometry2.computeBoundingSphere();
      return geometry2;
    }
    function handleElement(buffer, elementName, element, cacheEntry) {
      if (elementName === "vertex") {
        buffer.vertices.push(element[cacheEntry.attrX], element[cacheEntry.attrY], element[cacheEntry.attrZ]);
        if (cacheEntry.attrNX !== null && cacheEntry.attrNY !== null && cacheEntry.attrNZ !== null) {
          buffer.normals.push(element[cacheEntry.attrNX], element[cacheEntry.attrNY], element[cacheEntry.attrNZ]);
        }
        if (cacheEntry.attrS !== null && cacheEntry.attrT !== null) {
          buffer.uvs.push(element[cacheEntry.attrS], element[cacheEntry.attrT]);
        }
        if (cacheEntry.attrR !== null && cacheEntry.attrG !== null && cacheEntry.attrB !== null) {
          _color$1.setRGB(
            element[cacheEntry.attrR] / 255,
            element[cacheEntry.attrG] / 255,
            element[cacheEntry.attrB] / 255,
            SRGBColorSpace
          );
          buffer.colors.push(_color$1.r, _color$1.g, _color$1.b);
        }
        for (const customProperty of Object.keys(scope.customPropertyMapping)) {
          for (const elementProperty of scope.customPropertyMapping[customProperty]) {
            buffer[customProperty].push(element[elementProperty]);
          }
        }
      } else if (elementName === "face") {
        const vertex_indices = element.vertex_indices || element.vertex_index;
        const texcoord = element.texcoord;
        if (vertex_indices.length === 3) {
          buffer.indices.push(vertex_indices[0], vertex_indices[1], vertex_indices[2]);
          if (texcoord && texcoord.length === 6) {
            buffer.faceVertexUvs.push(texcoord[0], texcoord[1]);
            buffer.faceVertexUvs.push(texcoord[2], texcoord[3]);
            buffer.faceVertexUvs.push(texcoord[4], texcoord[5]);
          }
        } else if (vertex_indices.length === 4) {
          buffer.indices.push(vertex_indices[0], vertex_indices[1], vertex_indices[3]);
          buffer.indices.push(vertex_indices[1], vertex_indices[2], vertex_indices[3]);
        }
        if (cacheEntry.attrR !== null && cacheEntry.attrG !== null && cacheEntry.attrB !== null) {
          _color$1.setRGB(
            element[cacheEntry.attrR] / 255,
            element[cacheEntry.attrG] / 255,
            element[cacheEntry.attrB] / 255,
            SRGBColorSpace
          );
          buffer.faceVertexColors.push(_color$1.r, _color$1.g, _color$1.b);
          buffer.faceVertexColors.push(_color$1.r, _color$1.g, _color$1.b);
          buffer.faceVertexColors.push(_color$1.r, _color$1.g, _color$1.b);
        }
      }
    }
    function binaryReadElement(at, properties) {
      const element = {};
      let read = 0;
      for (let i = 0; i < properties.length; i++) {
        const property = properties[i];
        const valueReader = property.valueReader;
        if (property.type === "list") {
          const list = [];
          const n2 = property.countReader.read(at + read);
          read += property.countReader.size;
          for (let j = 0; j < n2; j++) {
            list.push(valueReader.read(at + read));
            read += valueReader.size;
          }
          element[property.name] = list;
        } else {
          element[property.name] = valueReader.read(at + read);
          read += valueReader.size;
        }
      }
      return [element, read];
    }
    function setPropertyBinaryReaders(properties, body, little_endian) {
      function getBinaryReader(dataview, type, little_endian2) {
        switch (type) {
          case "int8":
          case "char":
            return { read: (at) => {
              return dataview.getInt8(at);
            }, size: 1 };
          case "uint8":
          case "uchar":
            return { read: (at) => {
              return dataview.getUint8(at);
            }, size: 1 };
          case "int16":
          case "short":
            return { read: (at) => {
              return dataview.getInt16(at, little_endian2);
            }, size: 2 };
          case "uint16":
          case "ushort":
            return { read: (at) => {
              return dataview.getUint16(at, little_endian2);
            }, size: 2 };
          case "int32":
          case "int":
            return { read: (at) => {
              return dataview.getInt32(at, little_endian2);
            }, size: 4 };
          case "uint32":
          case "uint":
            return { read: (at) => {
              return dataview.getUint32(at, little_endian2);
            }, size: 4 };
          case "float32":
          case "float":
            return { read: (at) => {
              return dataview.getFloat32(at, little_endian2);
            }, size: 4 };
          case "float64":
          case "double":
            return { read: (at) => {
              return dataview.getFloat64(at, little_endian2);
            }, size: 8 };
        }
      }
      for (let i = 0, l2 = properties.length; i < l2; i++) {
        const property = properties[i];
        if (property.type === "list") {
          property.countReader = getBinaryReader(body, property.countType, little_endian);
          property.valueReader = getBinaryReader(body, property.itemType, little_endian);
        } else {
          property.valueReader = getBinaryReader(body, property.type, little_endian);
        }
      }
    }
    function parseBinary(data2, header) {
      const buffer = createBuffer();
      const little_endian = header.format === "binary_little_endian";
      const body = new DataView(data2, header.headerLength);
      let result, loc = 0;
      for (let currentElement = 0; currentElement < header.elements.length; currentElement++) {
        const elementDesc = header.elements[currentElement];
        const properties = elementDesc.properties;
        const attributeMap = mapElementAttributes(properties);
        setPropertyBinaryReaders(properties, body, little_endian);
        for (let currentElementCount = 0; currentElementCount < elementDesc.count; currentElementCount++) {
          result = binaryReadElement(loc, properties);
          loc += result[1];
          const element = result[0];
          handleElement(buffer, elementDesc.name, element, attributeMap);
        }
      }
      return postProcess(buffer);
    }
    function extractHeaderText(bytes) {
      let i = 0;
      let cont = true;
      let line = "";
      const lines = [];
      const startLine = new TextDecoder().decode(bytes.subarray(0, 5));
      const hasCRNL = /^ply\r\n/.test(startLine);
      do {
        const c2 = String.fromCharCode(bytes[i++]);
        if (c2 !== "\n" && c2 !== "\r") {
          line += c2;
        } else {
          if (line === "end_header") cont = false;
          if (line !== "") {
            lines.push(line);
            line = "";
          }
        }
      } while (cont && i < bytes.length);
      if (hasCRNL === true) i++;
      return { headerText: lines.join("\r") + "\r", headerLength: i };
    }
    let geometry;
    const scope = this;
    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      const { headerText, headerLength } = extractHeaderText(bytes);
      const header = parseHeader(headerText, headerLength);
      if (header.format === "ascii") {
        const text = new TextDecoder().decode(bytes);
        geometry = parseASCII(text, header);
      } else {
        geometry = parseBinary(data, header);
      }
    } else {
      geometry = parseASCII(data, parseHeader(data));
    }
    return geometry;
  }
}
class ArrayStream {
  constructor(arr) {
    this.arr = arr;
    this.i = 0;
  }
  empty() {
    return this.i >= this.arr.length;
  }
  next() {
    return this.arr[this.i++];
  }
}
const _object_pattern = /^[og]\s*(.+)?/;
const _material_library_pattern = /^mtllib /;
const _material_use_pattern = /^usemtl /;
const _map_use_pattern = /^usemap /;
const _face_vertex_data_separator_pattern = /\s+/;
const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();
const _ab = new Vector3();
const _cb = new Vector3();
const _color = new Color();
function ParserState() {
  const state = {
    objects: [],
    object: {},
    vertices: [],
    normals: [],
    colors: [],
    uvs: [],
    materials: {},
    materialLibraries: [],
    startObject: function(name, fromDeclaration) {
      if (this.object && this.object.fromDeclaration === false) {
        this.object.name = name;
        this.object.fromDeclaration = fromDeclaration !== false;
        return;
      }
      const previousMaterial = this.object && typeof this.object.currentMaterial === "function" ? this.object.currentMaterial() : void 0;
      if (this.object && typeof this.object._finalize === "function") {
        this.object._finalize(true);
      }
      this.object = {
        name: name || "",
        fromDeclaration: fromDeclaration !== false,
        geometry: {
          vertices: [],
          normals: [],
          colors: [],
          uvs: [],
          hasUVIndices: false
        },
        materials: [],
        smooth: true,
        startMaterial: function(name2, libraries) {
          const previous = this._finalize(false);
          if (previous && (previous.inherited || previous.groupCount <= 0)) {
            this.materials.splice(previous.index, 1);
          }
          const material = {
            index: this.materials.length,
            name: name2 || "",
            mtllib: Array.isArray(libraries) && libraries.length > 0 ? libraries[libraries.length - 1] : "",
            smooth: previous !== void 0 ? previous.smooth : this.smooth,
            groupStart: previous !== void 0 ? previous.groupEnd : 0,
            groupEnd: -1,
            groupCount: -1,
            inherited: false,
            clone: function(index2) {
              const cloned = {
                index: typeof index2 === "number" ? index2 : this.index,
                name: this.name,
                mtllib: this.mtllib,
                smooth: this.smooth,
                groupStart: 0,
                groupEnd: -1,
                groupCount: -1,
                inherited: false
              };
              cloned.clone = this.clone.bind(cloned);
              return cloned;
            }
          };
          this.materials.push(material);
          return material;
        },
        currentMaterial: function() {
          if (this.materials.length > 0) {
            return this.materials[this.materials.length - 1];
          }
          return void 0;
        },
        _finalize: function(end) {
          const lastMultiMaterial = this.currentMaterial();
          if (lastMultiMaterial && lastMultiMaterial.groupEnd === -1) {
            lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3;
            lastMultiMaterial.groupCount = lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart;
            lastMultiMaterial.inherited = false;
          }
          if (end && this.materials.length > 1) {
            for (let mi = this.materials.length - 1; mi >= 0; mi--) {
              if (this.materials[mi].groupCount <= 0) {
                this.materials.splice(mi, 1);
              }
            }
          }
          if (end && this.materials.length === 0) {
            this.materials.push({
              name: "",
              smooth: this.smooth
            });
          }
          return lastMultiMaterial;
        }
      };
      if (previousMaterial && previousMaterial.name && typeof previousMaterial.clone === "function") {
        const declared = previousMaterial.clone(0);
        declared.inherited = true;
        this.object.materials.push(declared);
      }
      this.objects.push(this.object);
    },
    finalize: function() {
      if (this.object && typeof this.object._finalize === "function") {
        this.object._finalize(true);
      }
    },
    parseVertexIndex: function(value, len) {
      const index2 = parseInt(value, 10);
      return (index2 >= 0 ? index2 - 1 : index2 + len / 3) * 3;
    },
    parseNormalIndex: function(value, len) {
      const index2 = parseInt(value, 10);
      return (index2 >= 0 ? index2 - 1 : index2 + len / 3) * 3;
    },
    parseUVIndex: function(value, len) {
      const index2 = parseInt(value, 10);
      return (index2 >= 0 ? index2 - 1 : index2 + len / 2) * 2;
    },
    addVertex: function(a2, b2, c2) {
      const src = this.vertices;
      const dst = this.object.geometry.vertices;
      dst.push(src[a2 + 0], src[a2 + 1], src[a2 + 2]);
      dst.push(src[b2 + 0], src[b2 + 1], src[b2 + 2]);
      dst.push(src[c2 + 0], src[c2 + 1], src[c2 + 2]);
    },
    addVertexPoint: function(a2) {
      const src = this.vertices;
      const dst = this.object.geometry.vertices;
      dst.push(src[a2 + 0], src[a2 + 1], src[a2 + 2]);
    },
    addVertexLine: function(a2) {
      const src = this.vertices;
      const dst = this.object.geometry.vertices;
      dst.push(src[a2 + 0], src[a2 + 1], src[a2 + 2]);
    },
    addNormal: function(a2, b2, c2) {
      const src = this.normals;
      const dst = this.object.geometry.normals;
      dst.push(src[a2 + 0], src[a2 + 1], src[a2 + 2]);
      dst.push(src[b2 + 0], src[b2 + 1], src[b2 + 2]);
      dst.push(src[c2 + 0], src[c2 + 1], src[c2 + 2]);
    },
    addFaceNormal: function(a2, b2, c2) {
      const src = this.vertices;
      const dst = this.object.geometry.normals;
      _vA.fromArray(src, a2);
      _vB.fromArray(src, b2);
      _vC.fromArray(src, c2);
      _cb.subVectors(_vC, _vB);
      _ab.subVectors(_vA, _vB);
      _cb.cross(_ab);
      _cb.normalize();
      dst.push(_cb.x, _cb.y, _cb.z);
      dst.push(_cb.x, _cb.y, _cb.z);
      dst.push(_cb.x, _cb.y, _cb.z);
    },
    addColor: function(a2, b2, c2) {
      const src = this.colors;
      const dst = this.object.geometry.colors;
      if (src[a2] !== void 0) dst.push(src[a2 + 0], src[a2 + 1], src[a2 + 2]);
      if (src[b2] !== void 0) dst.push(src[b2 + 0], src[b2 + 1], src[b2 + 2]);
      if (src[c2] !== void 0) dst.push(src[c2 + 0], src[c2 + 1], src[c2 + 2]);
    },
    addUV: function(a2, b2, c2) {
      const src = this.uvs;
      const dst = this.object.geometry.uvs;
      dst.push(src[a2 + 0], src[a2 + 1]);
      dst.push(src[b2 + 0], src[b2 + 1]);
      dst.push(src[c2 + 0], src[c2 + 1]);
    },
    addDefaultUV: function() {
      const dst = this.object.geometry.uvs;
      dst.push(0, 0);
      dst.push(0, 0);
      dst.push(0, 0);
    },
    addUVLine: function(a2) {
      const src = this.uvs;
      const dst = this.object.geometry.uvs;
      dst.push(src[a2 + 0], src[a2 + 1]);
    },
    addFace: function(a2, b2, c2, ua, ub, uc, na, nb, nc) {
      const vLen = this.vertices.length;
      let ia = this.parseVertexIndex(a2, vLen);
      let ib = this.parseVertexIndex(b2, vLen);
      let ic = this.parseVertexIndex(c2, vLen);
      this.addVertex(ia, ib, ic);
      this.addColor(ia, ib, ic);
      if (na !== void 0 && na !== "") {
        const nLen = this.normals.length;
        ia = this.parseNormalIndex(na, nLen);
        ib = this.parseNormalIndex(nb, nLen);
        ic = this.parseNormalIndex(nc, nLen);
        this.addNormal(ia, ib, ic);
      } else {
        this.addFaceNormal(ia, ib, ic);
      }
      if (ua !== void 0 && ua !== "") {
        const uvLen = this.uvs.length;
        ia = this.parseUVIndex(ua, uvLen);
        ib = this.parseUVIndex(ub, uvLen);
        ic = this.parseUVIndex(uc, uvLen);
        this.addUV(ia, ib, ic);
        this.object.geometry.hasUVIndices = true;
      } else {
        this.addDefaultUV();
      }
    },
    addPointGeometry: function(vertices) {
      this.object.geometry.type = "Points";
      const vLen = this.vertices.length;
      for (let vi = 0, l2 = vertices.length; vi < l2; vi++) {
        const index2 = this.parseVertexIndex(vertices[vi], vLen);
        this.addVertexPoint(index2);
        this.addColor(index2);
      }
    },
    addLineGeometry: function(vertices, uvs) {
      this.object.geometry.type = "Line";
      const vLen = this.vertices.length;
      const uvLen = this.uvs.length;
      for (let vi = 0, l2 = vertices.length; vi < l2; vi++) {
        this.addVertexLine(this.parseVertexIndex(vertices[vi], vLen));
      }
      for (let uvi = 0, l2 = uvs.length; uvi < l2; uvi++) {
        this.addUVLine(this.parseUVIndex(uvs[uvi], uvLen));
      }
    }
  };
  state.startObject("", false);
  return state;
}
class OBJLoader extends Loader {
  /**
   * Constructs a new OBJ loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
    this.materials = null;
  }
  /**
   * Starts loading from the given URL and passes the loaded OBJ asset
   * to the `onLoad()` callback.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(Group)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
   * @param {onErrorCallback} onError - Executed when errors occur.
   */
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(url, function(text) {
      try {
        onLoad(scope.parse(text));
      } catch (e2) {
        if (onError) {
          onError(e2);
        } else {
          console.error(e2);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }
  /**
   * Sets the material creator for this OBJ. This object is loaded via {@link MTLLoader}.
   *
   * @param {MaterialCreator} materials - An object that creates the materials for this OBJ.
   * @return {OBJLoader} A reference to this loader.
   */
  setMaterials(materials) {
    this.materials = materials;
    return this;
  }
  /**
   * Parses the given OBJ data and returns the resulting group.
   *
   * @param {string} text - The raw OBJ data as a string.
   * @return {Group} The parsed OBJ.
   */
  parse(text) {
    const state = new ParserState();
    if (text.indexOf("\r\n") !== -1) {
      text = text.replace(/\r\n/g, "\n");
    }
    if (text.indexOf("\\\n") !== -1) {
      text = text.replace(/\\\n/g, "");
    }
    const lines = text.split("\n");
    let result = [];
    for (let i = 0, l2 = lines.length; i < l2; i++) {
      const line = lines[i].trimStart();
      if (line.length === 0) continue;
      const lineFirstChar = line.charAt(0);
      if (lineFirstChar === "#") continue;
      if (lineFirstChar === "v") {
        const data = line.split(_face_vertex_data_separator_pattern);
        switch (data[0]) {
          case "v":
            state.vertices.push(
              parseFloat(data[1]),
              parseFloat(data[2]),
              parseFloat(data[3])
            );
            if (data.length >= 7) {
              _color.setRGB(
                parseFloat(data[4]),
                parseFloat(data[5]),
                parseFloat(data[6]),
                SRGBColorSpace
              );
              state.colors.push(_color.r, _color.g, _color.b);
            } else {
              state.colors.push(void 0, void 0, void 0);
            }
            break;
          case "vn":
            state.normals.push(
              parseFloat(data[1]),
              parseFloat(data[2]),
              parseFloat(data[3])
            );
            break;
          case "vt":
            state.uvs.push(
              parseFloat(data[1]),
              parseFloat(data[2])
            );
            break;
        }
      } else if (lineFirstChar === "f") {
        const lineData = line.slice(1).trim();
        const vertexData = lineData.split(_face_vertex_data_separator_pattern);
        const faceVertices = [];
        for (let j = 0, jl = vertexData.length; j < jl; j++) {
          const vertex = vertexData[j];
          if (vertex.length > 0) {
            const vertexParts = vertex.split("/");
            faceVertices.push(vertexParts);
          }
        }
        const v1 = faceVertices[0];
        for (let j = 1, jl = faceVertices.length - 1; j < jl; j++) {
          const v2 = faceVertices[j];
          const v3 = faceVertices[j + 1];
          state.addFace(
            v1[0],
            v2[0],
            v3[0],
            v1[1],
            v2[1],
            v3[1],
            v1[2],
            v2[2],
            v3[2]
          );
        }
      } else if (lineFirstChar === "l") {
        const lineParts = line.substring(1).trim().split(" ");
        let lineVertices = [];
        const lineUVs = [];
        if (line.indexOf("/") === -1) {
          lineVertices = lineParts;
        } else {
          for (let li = 0, llen = lineParts.length; li < llen; li++) {
            const parts = lineParts[li].split("/");
            if (parts[0] !== "") lineVertices.push(parts[0]);
            if (parts[1] !== "") lineUVs.push(parts[1]);
          }
        }
        state.addLineGeometry(lineVertices, lineUVs);
      } else if (lineFirstChar === "p") {
        const lineData = line.slice(1).trim();
        const pointData = lineData.split(" ");
        state.addPointGeometry(pointData);
      } else if ((result = _object_pattern.exec(line)) !== null) {
        const name = (" " + result[0].slice(1).trim()).slice(1);
        state.startObject(name);
      } else if (_material_use_pattern.test(line)) {
        state.object.startMaterial(line.substring(7).trim(), state.materialLibraries);
      } else if (_material_library_pattern.test(line)) {
        state.materialLibraries.push(line.substring(7).trim());
      } else if (_map_use_pattern.test(line)) {
        console.warn('THREE.OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.');
      } else if (lineFirstChar === "s") {
        result = line.split(" ");
        if (result.length > 1) {
          const value = result[1].trim().toLowerCase();
          state.object.smooth = value !== "0" && value !== "off";
        } else {
          state.object.smooth = true;
        }
        const material = state.object.currentMaterial();
        if (material) material.smooth = state.object.smooth;
      } else {
        if (line === "\0") continue;
        console.warn('THREE.OBJLoader: Unexpected line: "' + line + '"');
      }
    }
    state.finalize();
    const container = new Group();
    container.materialLibraries = [].concat(state.materialLibraries);
    const hasPrimitives = !(state.objects.length === 1 && state.objects[0].geometry.vertices.length === 0);
    if (hasPrimitives === true) {
      for (let i = 0, l2 = state.objects.length; i < l2; i++) {
        const object2 = state.objects[i];
        const geometry = object2.geometry;
        const materials = object2.materials;
        const isLine = geometry.type === "Line";
        const isPoints = geometry.type === "Points";
        let hasVertexColors = false;
        if (geometry.vertices.length === 0) continue;
        const buffergeometry = new BufferGeometry();
        buffergeometry.setAttribute("position", new Float32BufferAttribute(geometry.vertices, 3));
        if (geometry.normals.length > 0) {
          buffergeometry.setAttribute("normal", new Float32BufferAttribute(geometry.normals, 3));
        }
        if (geometry.colors.length > 0) {
          hasVertexColors = true;
          buffergeometry.setAttribute("color", new Float32BufferAttribute(geometry.colors, 3));
        }
        if (geometry.hasUVIndices === true) {
          buffergeometry.setAttribute("uv", new Float32BufferAttribute(geometry.uvs, 2));
        }
        const createdMaterials = [];
        for (let mi = 0, miLen = materials.length; mi < miLen; mi++) {
          const sourceMaterial = materials[mi];
          const materialHash = sourceMaterial.name + "_" + sourceMaterial.smooth + "_" + hasVertexColors;
          let material = state.materials[materialHash];
          if (this.materials !== null) {
            material = this.materials.create(sourceMaterial.name);
            if (isLine && material && !(material instanceof LineBasicMaterial)) {
              const materialLine = new LineBasicMaterial();
              Material.prototype.copy.call(materialLine, material);
              materialLine.color.copy(material.color);
              material = materialLine;
            } else if (isPoints && material && !(material instanceof PointsMaterial)) {
              const materialPoints = new PointsMaterial({ size: 10, sizeAttenuation: false });
              Material.prototype.copy.call(materialPoints, material);
              materialPoints.color.copy(material.color);
              materialPoints.map = material.map;
              material = materialPoints;
            }
          }
          if (material === void 0) {
            if (isLine) {
              material = new LineBasicMaterial();
            } else if (isPoints) {
              material = new PointsMaterial({ size: 1, sizeAttenuation: false });
            } else {
              material = new MeshPhongMaterial();
            }
            material.name = sourceMaterial.name;
            material.flatShading = sourceMaterial.smooth ? false : true;
            material.vertexColors = hasVertexColors;
            state.materials[materialHash] = material;
          }
          createdMaterials.push(material);
        }
        let mesh;
        if (createdMaterials.length > 1) {
          for (let mi = 0, miLen = materials.length; mi < miLen; mi++) {
            const sourceMaterial = materials[mi];
            buffergeometry.addGroup(sourceMaterial.groupStart, sourceMaterial.groupCount, mi);
          }
          if (isLine) {
            mesh = new LineSegments(buffergeometry, createdMaterials);
          } else if (isPoints) {
            mesh = new Points(buffergeometry, createdMaterials);
          } else {
            mesh = new Mesh(buffergeometry, createdMaterials);
          }
        } else {
          if (isLine) {
            mesh = new LineSegments(buffergeometry, createdMaterials[0]);
          } else if (isPoints) {
            mesh = new Points(buffergeometry, createdMaterials[0]);
          } else {
            mesh = new Mesh(buffergeometry, createdMaterials[0]);
          }
        }
        mesh.name = object2.name;
        container.add(mesh);
      }
    } else {
      if (state.vertices.length > 0) {
        const material = new PointsMaterial({ size: 1, sizeAttenuation: false });
        const buffergeometry = new BufferGeometry();
        buffergeometry.setAttribute("position", new Float32BufferAttribute(state.vertices, 3));
        if (state.colors.length > 0 && state.colors[0] !== void 0) {
          buffergeometry.setAttribute("color", new Float32BufferAttribute(state.colors, 3));
          material.vertexColors = true;
        }
        const points = new Points(buffergeometry, material);
        container.add(points);
      }
    }
    return container;
  }
}
class MTLLoader extends Loader {
  constructor(manager) {
    super(manager);
  }
  /**
   * Starts loading from the given URL and passes the loaded MTL asset
   * to the `onLoad()` callback.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(MaterialCreator)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
   * @param {onErrorCallback} onError - Executed when errors occur.
   */
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const path = this.path === "" ? LoaderUtils.extractUrlBase(url) : this.path;
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(url, function(text) {
      try {
        onLoad(scope.parse(text, path));
      } catch (e2) {
        if (onError) {
          onError(e2);
        } else {
          console.error(e2);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }
  /**
   * Sets the material options.
   *
   * @param {MTLLoader~MaterialOptions} value - The material options.
   * @return {MTLLoader} A reference to this loader.
   */
  setMaterialOptions(value) {
    this.materialOptions = value;
    return this;
  }
  /**
   * Parses the given MTL data and returns the resulting material creator.
   *
   * @param {string} text - The raw MTL data as a string.
   * @param {string} path - The URL base path.
   * @return {MaterialCreator} The material creator.
   */
  parse(text, path) {
    const lines = text.split("\n");
    let info = {};
    const delimiter_pattern = /\s+/;
    const materialsInfo = {};
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      line = line.trim();
      if (line.length === 0 || line.charAt(0) === "#") {
        continue;
      }
      const pos = line.indexOf(" ");
      let key = pos >= 0 ? line.substring(0, pos) : line;
      key = key.toLowerCase();
      let value = pos >= 0 ? line.substring(pos + 1) : "";
      value = value.trim();
      if (key === "newmtl") {
        info = { name: value };
        materialsInfo[value] = info;
      } else {
        if (key === "ka" || key === "kd" || key === "ks" || key === "ke") {
          const ss = value.split(delimiter_pattern, 3);
          info[key] = [parseFloat(ss[0]), parseFloat(ss[1]), parseFloat(ss[2])];
        } else {
          info[key] = value;
        }
      }
    }
    const materialCreator = new MaterialCreator(this.resourcePath || path, this.materialOptions);
    materialCreator.setCrossOrigin(this.crossOrigin);
    materialCreator.setManager(this.manager);
    materialCreator.setMaterials(materialsInfo);
    return materialCreator;
  }
}
class MaterialCreator {
  constructor(baseUrl = "", options = {}) {
    this.baseUrl = baseUrl;
    this.options = options;
    this.materialsInfo = {};
    this.materials = {};
    this.materialsArray = [];
    this.nameLookup = {};
    this.crossOrigin = "anonymous";
    this.side = this.options.side !== void 0 ? this.options.side : FrontSide;
    this.wrap = this.options.wrap !== void 0 ? this.options.wrap : RepeatWrapping;
  }
  setCrossOrigin(value) {
    this.crossOrigin = value;
    return this;
  }
  setManager(value) {
    this.manager = value;
  }
  setMaterials(materialsInfo) {
    this.materialsInfo = this.convert(materialsInfo);
    this.materials = {};
    this.materialsArray = [];
    this.nameLookup = {};
  }
  convert(materialsInfo) {
    if (!this.options) return materialsInfo;
    const converted = {};
    for (const mn in materialsInfo) {
      const mat = materialsInfo[mn];
      const covmat = {};
      converted[mn] = covmat;
      for (const prop in mat) {
        let save = true;
        let value = mat[prop];
        const lprop = prop.toLowerCase();
        switch (lprop) {
          case "kd":
          case "ka":
          case "ks":
            if (this.options && this.options.normalizeRGB) {
              value = [value[0] / 255, value[1] / 255, value[2] / 255];
            }
            if (this.options && this.options.ignoreZeroRGBs) {
              if (value[0] === 0 && value[1] === 0 && value[2] === 0) {
                save = false;
              }
            }
            break;
        }
        if (save) {
          covmat[lprop] = value;
        }
      }
    }
    return converted;
  }
  preload() {
    for (const mn in this.materialsInfo) {
      this.create(mn);
    }
  }
  getIndex(materialName) {
    return this.nameLookup[materialName];
  }
  getAsArray() {
    let index2 = 0;
    for (const mn in this.materialsInfo) {
      this.materialsArray[index2] = this.create(mn);
      this.nameLookup[mn] = index2;
      index2++;
    }
    return this.materialsArray;
  }
  create(materialName) {
    if (this.materials[materialName] === void 0) {
      this.createMaterial_(materialName);
    }
    return this.materials[materialName];
  }
  createMaterial_(materialName) {
    const scope = this;
    const mat = this.materialsInfo[materialName];
    const params = {
      name: materialName,
      side: this.side
    };
    function resolveURL(baseUrl, url) {
      if (typeof url !== "string" || url === "")
        return "";
      if (/^https?:\/\//i.test(url)) return url;
      return baseUrl + url;
    }
    function setMapForType(mapType, value) {
      if (params[mapType]) return;
      const texParams = scope.getTextureParams(value, params);
      const map = scope.loadTexture(resolveURL(scope.baseUrl, texParams.url));
      map.repeat.copy(texParams.scale);
      map.offset.copy(texParams.offset);
      map.wrapS = scope.wrap;
      map.wrapT = scope.wrap;
      if (mapType === "map" || mapType === "emissiveMap") {
        map.colorSpace = SRGBColorSpace;
      }
      params[mapType] = map;
    }
    for (const prop in mat) {
      const value = mat[prop];
      let n2;
      if (value === "") continue;
      switch (prop.toLowerCase()) {
        case "kd":
          params.color = ColorManagement.colorSpaceToWorking(new Color().fromArray(value), SRGBColorSpace);
          break;
        case "ks":
          params.specular = ColorManagement.colorSpaceToWorking(new Color().fromArray(value), SRGBColorSpace);
          break;
        case "ke":
          params.emissive = ColorManagement.colorSpaceToWorking(new Color().fromArray(value), SRGBColorSpace);
          break;
        case "map_kd":
          setMapForType("map", value);
          break;
        case "map_ks":
          setMapForType("specularMap", value);
          break;
        case "map_ke":
          setMapForType("emissiveMap", value);
          break;
        case "norm":
          setMapForType("normalMap", value);
          break;
        case "map_bump":
        case "bump":
          setMapForType("bumpMap", value);
          break;
        case "disp":
          setMapForType("displacementMap", value);
          break;
        case "map_d":
          setMapForType("alphaMap", value);
          params.transparent = true;
          break;
        case "ns":
          params.shininess = parseFloat(value);
          break;
        case "d":
          n2 = parseFloat(value);
          if (n2 < 1) {
            params.opacity = n2;
            params.transparent = true;
          }
          break;
        case "tr":
          n2 = parseFloat(value);
          if (this.options && this.options.invertTrProperty) n2 = 1 - n2;
          if (n2 > 0) {
            params.opacity = 1 - n2;
            params.transparent = true;
          }
          break;
      }
    }
    this.materials[materialName] = new MeshPhongMaterial(params);
    return this.materials[materialName];
  }
  getTextureParams(value, matParams) {
    const texParams = {
      scale: new Vector2(1, 1),
      offset: new Vector2(0, 0)
    };
    const items = value.split(/\s+/);
    let pos;
    pos = items.indexOf("-bm");
    if (pos >= 0) {
      matParams.bumpScale = parseFloat(items[pos + 1]);
      items.splice(pos, 2);
    }
    pos = items.indexOf("-mm");
    if (pos >= 0) {
      matParams.displacementBias = parseFloat(items[pos + 1]);
      matParams.displacementScale = parseFloat(items[pos + 2]);
      items.splice(pos, 3);
    }
    pos = items.indexOf("-s");
    if (pos >= 0) {
      texParams.scale.set(parseFloat(items[pos + 1]), parseFloat(items[pos + 2]));
      items.splice(pos, 4);
    }
    pos = items.indexOf("-o");
    if (pos >= 0) {
      texParams.offset.set(parseFloat(items[pos + 1]), parseFloat(items[pos + 2]));
      items.splice(pos, 4);
    }
    texParams.url = items.join(" ").trim();
    return texParams;
  }
  loadTexture(url, mapping, onLoad, onProgress, onError) {
    const manager = this.manager !== void 0 ? this.manager : DefaultLoadingManager;
    let loader = manager.getHandler(url);
    if (loader === null) {
      loader = new TextureLoader(manager);
    }
    if (loader.setCrossOrigin) loader.setCrossOrigin(this.crossOrigin);
    const texture = loader.load(url, onLoad, onProgress, onError);
    if (mapping !== void 0) texture.mapping = mapping;
    return texture;
  }
}
function mergeGeometries$1(geometries, useGroups = false) {
  const isIndexed = geometries[0].index !== null;
  const attributesUsed = new Set(Object.keys(geometries[0].attributes));
  const morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes));
  const attributes = {};
  const morphAttributes = {};
  const morphTargetsRelative = geometries[0].morphTargetsRelative;
  const mergedGeometry = new BufferGeometry();
  let offset = 0;
  for (let i = 0; i < geometries.length; ++i) {
    const geometry = geometries[i];
    let attributesCount = 0;
    if (isIndexed !== (geometry.index !== null)) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");
      return null;
    }
    for (const name in geometry.attributes) {
      if (!attributesUsed.has(name)) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.');
        return null;
      }
      if (attributes[name] === void 0) attributes[name] = [];
      attributes[name].push(geometry.attributes[name]);
      attributesCount++;
    }
    if (attributesCount !== attributesUsed.size) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". Make sure all geometries have the same number of attributes.");
      return null;
    }
    if (morphTargetsRelative !== geometry.morphTargetsRelative) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". .morphTargetsRelative must be consistent throughout all geometries.");
      return null;
    }
    for (const name in geometry.morphAttributes) {
      if (!morphAttributesUsed.has(name)) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ".  .morphAttributes must be consistent throughout all geometries.");
        return null;
      }
      if (morphAttributes[name] === void 0) morphAttributes[name] = [];
      morphAttributes[name].push(geometry.morphAttributes[name]);
    }
    if (useGroups) {
      let count;
      if (isIndexed) {
        count = geometry.index.count;
      } else if (geometry.attributes.position !== void 0) {
        count = geometry.attributes.position.count;
      } else {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". The geometry must have either an index or a position attribute");
        return null;
      }
      mergedGeometry.addGroup(offset, count, i);
      offset += count;
    }
  }
  if (isIndexed) {
    let indexOffset = 0;
    const mergedIndex = [];
    for (let i = 0; i < geometries.length; ++i) {
      const index2 = geometries[i].index;
      for (let j = 0; j < index2.count; ++j) {
        mergedIndex.push(index2.getX(j) + indexOffset);
      }
      indexOffset += geometries[i].attributes.position.count;
    }
    mergedGeometry.setIndex(mergedIndex);
  }
  for (const name in attributes) {
    const mergedAttribute = mergeAttributes(attributes[name]);
    if (!mergedAttribute) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " attribute.");
      return null;
    }
    mergedGeometry.setAttribute(name, mergedAttribute);
  }
  for (const name in morphAttributes) {
    const numMorphTargets = morphAttributes[name][0].length;
    if (numMorphTargets === 0) break;
    mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
    mergedGeometry.morphAttributes[name] = [];
    for (let i = 0; i < numMorphTargets; ++i) {
      const morphAttributesToMerge = [];
      for (let j = 0; j < morphAttributes[name].length; ++j) {
        morphAttributesToMerge.push(morphAttributes[name][j][i]);
      }
      const mergedMorphAttribute = mergeAttributes(morphAttributesToMerge);
      if (!mergedMorphAttribute) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " morphAttribute.");
        return null;
      }
      mergedGeometry.morphAttributes[name].push(mergedMorphAttribute);
    }
  }
  return mergedGeometry;
}
function mergeAttributes(attributes) {
  let TypedArray;
  let itemSize;
  let normalized;
  let gpuType = -1;
  let arrayLength = 0;
  for (let i = 0; i < attributes.length; ++i) {
    const attribute = attributes[i];
    if (TypedArray === void 0) TypedArray = attribute.array.constructor;
    if (TypedArray !== attribute.array.constructor) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.");
      return null;
    }
    if (itemSize === void 0) itemSize = attribute.itemSize;
    if (itemSize !== attribute.itemSize) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.");
      return null;
    }
    if (normalized === void 0) normalized = attribute.normalized;
    if (normalized !== attribute.normalized) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.");
      return null;
    }
    if (gpuType === -1) gpuType = attribute.gpuType;
    if (gpuType !== attribute.gpuType) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.");
      return null;
    }
    arrayLength += attribute.count * itemSize;
  }
  const array = new TypedArray(arrayLength);
  const result = new BufferAttribute(array, itemSize, normalized);
  let offset = 0;
  for (let i = 0; i < attributes.length; ++i) {
    const attribute = attributes[i];
    if (attribute.isInterleavedBufferAttribute) {
      const tupleOffset = offset / itemSize;
      for (let j = 0, l2 = attribute.count; j < l2; j++) {
        for (let c2 = 0; c2 < itemSize; c2++) {
          const value = attribute.getComponent(j, c2);
          result.setComponent(j + tupleOffset, c2, value);
        }
      }
    } else {
      array.set(attribute.array, offset);
    }
    offset += attribute.count * itemSize;
  }
  if (gpuType !== void 0) {
    result.gpuType = gpuType;
  }
  return result;
}
const e = { ECB: 0, CBC: 1 }, f = { PKCS5: 0, ONE_AND_ZEROS: 1, LAST_BYTE: 2, NULL: 3, SPACES: 4 }, c$1 = { STRING: 0, UINT8_ARRAY: 1 };
function a(e2) {
  return e2 >>> 0;
}
function b(e2, f2) {
  return a(e2 ^ f2);
}
function d(e2, f2) {
  return a(e2 + f2 | 0);
}
function t(e2, f2, c2, b2) {
  return a(e2 << 24 | f2 << 16 | c2 << 8 | b2);
}
function r(e2) {
  return [e2 >>> 24 & 255, e2 >>> 16 & 255, e2 >>> 8 & 255, 255 & e2];
}
function n(e2) {
  return "string" == typeof e2;
}
function s(e2) {
  return "object" == typeof e2 && "byteLength" in e2;
}
function i$1(e2) {
  return n(e2) || s(e2);
}
function o(e2, f2) {
  let c2 = false;
  return Object.keys(e2).forEach((a2) => {
    e2[a2] === f2 && (c2 = true);
  }), c2;
}
function h(e2) {
  if (n(e2)) return new TextEncoder().encode(e2);
  if (s(e2)) return new Uint8Array(e2);
  throw new Error("Unsupported type");
}
const u = "243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89452821e638d01377be5466cf34e90c6cc0ac29b7c97c50dd3f84d5b5b54709179216d5d98979fb1bd1310ba698dfb5ac2ffd72dbd01adfb7b8e1afed6a267e96ba7c9045f12c7f9924a19947b3916cf70801f2e2858efc16636920d871574e69a458fea3f4933d7e0d95748f728eb658718bcd5882154aee7b54a41dc25a59b59c30d5392af26013c5d1b023286085f0ca417918b8db38ef8e79dcb0603a180e6c9e0e8bb01e8a3ed71577c1bd314b2778af2fda55605c60e65525f3aa55ab945748986263e8144055ca396a2aab10b6b4cc5c341141e8cea15486af7c72e993b3ee1411636fbc2a2ba9c55d741831f6ce5c3e169b87931eafd6ba336c24cf5c7a325381289586773b8f48986b4bb9afc4bfe81b6628219361d809ccfb21a991487cac605dec8032ef845d5de98575b1dc262302eb651b8823893e81d396acc50f6d6ff383f442392e0b4482a484200469c8f04a9e1f9b5e21c66842f6e96c9a670c9c61abd388f06a51a0d2d8542f68960fa728ab5133a36eef0b6c137a3be4ba3bf0507efb2a98a1f1651d39af017666ca593e82430e888cee8619456f9fb47d84a5c33b8b5ebee06f75d885c12073401a449f56c16aa64ed3aa62363f77061bfedf72429b023d37d0d724d00a1248db0fead349f1c09b075372c980991b7b25d479d8f6e8def7e3fe501ab6794c3b976ce0bd04c006bac1a94fb6409f60c45e5c9ec2196a246368fb6faf3e6c53b51339b2eb3b52ec6f6dfc511f9b30952ccc814544af5ebd09bee3d004de334afd660f2807192e4bb3c0cba85745c8740fd20b5f39b9d3fbdb5579c0bd1a60320ad6a100c6402c7279679f25fefb1fa3cc8ea5e9f8db3222f83c7516dffd616b152f501ec8ad0552ab323db5fafd23876053317b483e00df829e5c57bbca6f8ca01a87562edf1769dbd542a8f6287effc3ac6732c68c4f5573695b27b0bbca58c8e1ffa35db8f011a010fa3d98fd2183b84afcb56c2dd1d35b9a53e479b6f84565d28e49bc4bfb9790e1ddf2daa4cb7e3362fb1341cee4c6e8ef20cada36774c01d07e9efe2bf11fb495dbda4dae909198eaad8e716b93d5a0d08ed1d0afc725e08e3c5b2f8e7594b78ff6e2fbf2122b648888b812900df01c4fad5ea0688fc31cd1cff191b3a8c1ad2f2f2218be0e1777ea752dfe8b021fa1e5a0cc0fb56f74e818acf3d6ce89e299b4a84fe0fd13e0b77cc43b81d2ada8d9165fa2668095770593cc7314211a1477e6ad206577b5fa86c75442f5fb9d35cfebcdaf0c7b3e89a0d6411bd3ae1e7e4900250e2d2071b35e226800bb57b8e0af2464369bf009b91e5563911d59dfa6aa78c14389d95a537f207d5ba202e5b9c5832603766295cfa911c819684e734a41b3472dca7b14a94a1b5100529a532915d60f573fbc9bc6e42b60a47681e6740008ba6fb5571be91ff296ec6b2a0dd915b6636521e7b9f9b6ff34052ec585566453b02d5da99f8fa108ba47996e85076a4b7a70e9b5b32944db75092ec4192623ad6ea6b049a7df7d9cee60b88fedb266ecaa8c71699a17ff5664526cc2b19ee1193602a575094c29a0591340e4183a3e3f54989a5b429d656b8fe4d699f73fd6a1d29c07efe830f54d2d38e6f0255dc14cdd20868470eb266382e9c6021ecc5e09686b3f3ebaefc93c9718146b6a70a1687f358452a0e286b79c5305aa5007373e07841c7fdeae5c8e7d44ec5716f2b8b03ada37f0500c0df01c1f040200b3ffae0cf51a3cb574b225837a58dc0921bdd19113f97ca92ff69432477322f547013ae5e58137c2dadcc8b576349af3dda7a94461460fd0030eecc8c73ea4751e41e238cd993bea0e2f3280bba1183eb3314e548b384f6db9086f420d03f60a04bf2cb8129024977c795679b072bcaf89afde9a771fd9930810b38bae12dccf3f2e5512721f2e6b7124501adde69f84cd877a5847187408da17bc9f9abce94b7d8cec7aec3adb851dfa63094366c464c3d2ef1c18473215d908dd433b3724c2ba1612a14d432a65c45150940002133ae4dd71dff89e10314e5581ac77d65f11199b043556f1d7a3c76b3c11183b5924a509f28fe6ed97f1fbfa9ebabf2c1e153c6e86e34570eae96fb1860e5e0a5a3e2ab3771fe71c4e3d06fa2965dcb999e71d0f803e89d65266c8252e4cc9789c10b36ac6150eba94e2ea78a5fc3c531e0a2df4f2f74ea7361d2b3d1939260f19c279605223a708f71312b6ebadfe6eeac31f66e3bc4595a67bc883b17f37d1018cff28c332ddefbe6c5aa56558218568ab9802eecea50fdb2f953b2aef7dad5b6e2f841521b62829076170ecdd4775619f151013cca830eb61bd960334fe1eaa0363cfb5735c904c70a239d59e9e0bcbaade14eecc86bc60622ca79cab5cabb2f3846e648b1eaf19bdf0caa02369b9655abb5040685a323c2ab4b3319ee9d5c021b8f79b540b19875fa09995f7997e623d7da8f837889a97e32d7711ed935f166812810e358829c7e61fd696dedfa17858ba9957f584a51b2272639b83c3ff1ac24696cdb30aeb532e30548fd948e46dbc312858ebf2ef34c6ffeafe28ed61ee7c3c735d4a14d9e864b7e342105d14203e13e045eee2b6a3aaabeadb6c4f15facb4fd0c742f442ef6abbb5654f3b1d41cd2105d81e799e86854dc7e44b476a3d816250cf62a1f25b8d2646fc8883a0c1c7b6a37f1524c369cb749247848a0b5692b285095bbf00ad19489d1462b17423820e0058428d2a0c55f5ea1dadf43e233f70613372f0928d937e41d65fecf16c223bdb7cde3759cbee74604085f2a7ce77326ea607808419f8509ee8efd85561d99735a969a7aac50c06c25a04abfc800bcadc9e447a2ec3453484fdd567050e1e9ec9db73dbd3105588cd675fda79e3674340c5c43465713e38d83d28f89ef16dff20153e21e78fb03d4ae6e39f2bdb83adf7e93d5a68948140f7f64c261c94692934411520f77602d4f7bcf46b2ed4a20068d40824713320f46a43b7d4b7500061af1e39f62e9724454614214f74bf8b88404d95fc1d96b591af70f4ddd366a02f45bfbc09ec03bd97857fac6dd031cb850496eb27b355fd3941da2547e6abca0a9a28507825530429f40a2c86dae9b66dfb68dc1462d7486900680ec0a427a18dee4f3ffea2e887ad8cb58ce0067af4d6b6aace1e7cd3375fecce78a399406b2a4220fe9e35d9f385b9ee39d7ab3b124e8b1dc9faf74b6d185626a36631eae397b23a6efa74dd5b43326841e7f7ca7820fbfb0af54ed8feb397454056acba48952755533a3a20838d87fe6ba9b7d096954b55a867bca1159a58cca9296399e1db33a62a4a563f3125f95ef47e1c9029317cfdf8e80204272f7080bb155c05282ce395c11548e4c66d2248c1133fc70f86dc07f9c9ee41041f0f404779a45d886e17325f51ebd59bc0d1f2bcc18f41113564257b7834602a9c60dff8e8a31f636c1b0e12b4c202e1329eaf664fd1cad181156b2395e0333e92e13b240b62eebeb92285b2a20ee6ba0d99de720c8c2da2f728d012784595b794fd647d0862e7ccf5f05449a36f877d48fac39dfd27f33e8d1e0a476341992eff743a6f6eabf4f8fd37a812dc60a1ebddf8991be14cdb6e6b0dc67b55106d672c372765d43bdcd0e804f1290dc7cc00ffa3b5390f92690fed0b667b9ffbcedb7d9ca091cf0bd9155ea3bb132f88515bad247b9479bf763bd6eb37392eb3cc1159798026e297f42e312d6842ada7c66a2b3b12754ccc782ef11c6a124237b79251e706a1bbe64bfb63501a6b101811caedfa3d25bdd8e2e1c3c9444216590a121386d90cec6ed5abea2a64af674eda86a85fbebfe98864e4c3fe9dbc8057f0f7c08660787bf86003604dd1fd8346f6381fb07745ae04d736fccc83426b33f01eab71b08041873c005e5f77a057bebde8ae2455464299bf582e614e58f48ff2ddfda2f474ef388789bdc25366f9c3c8b38e74b475f25546fcd9b97aeb26618b1ddf84846a0e79915f95e2466e598e20b457708cd55591c902de4cb90bace1bb8205d011a862487574a99eb77f19b6e0a9dc09662d09a1c4324633e85a1f0209f0be8c4a99a0251d6efe101ab93d1d0ba5a4dfa186f20f2868f169dcb7da83573906fea1e2ce9b4fcd7f5250115e01a70683faa002b5c40de6d0279af88c27773f8641c3604c0661a806b5f0177a28c0f586e0006058aa30dc7d6211e69ed72338ea6353c2dd94c2c21634bbcbee5690bcb6deebfc7da1ce591d766f05e4094b7c018839720a3d7c927c2486e3725f724d9db91ac15bb4d39eb8fced54557808fca5b5d83d7cd34dad0fc41e50ef5eb161e6f8a28514d96c51133c6fd5c7e756e14ec4362abfceddc6c837d79a323492638212670efa8e406000e03a39ce37d3faf5cfabc277375ac52d1b5cb0679e4fa33742d382274099bc9bbed5118e9dbf0f7315d62d1c7ec700c47bb78c1b6b21a19045b26eb1be6a366eb45748ab2fbc946e79c6a376d26549c2c8530ff8ee468dde7dd5730a1d4cd04dc62939bbdba9ba4650ac9526e8be5ee304a1fad5f06a2d519a63ef8ce29a86ee22c089c2b843242ef6a51e03aa9cf2d0a483c061ba9be96a4d8fe51550ba645bd62826a2f9a73a3ae14ba99586ef5562e9c72fefd3f752f7da3f046f6977fa0a5980e4a91587b086019b09e6ad3b3ee593e990fd5a9e34d7972cf0b7d9022b8b5196d5ac3a017da67dd1cf3ed67c7d2d281f9f25cfadf2b89b5ad6b4725a88f54ce029ac71e019a5e647b0acfded93fa9be8d3c48d283b57ccf8d5662979132e28785f0191ed756055f7960e44e3d35e8c15056dd488f46dba03a161250564f0bdc3eb9e153c9057a297271aeca93a072a1b3f6d9b1e6321f5f59c66fb26dcf3197533d928b155fdf5035634828aba3cbb28517711c20ad9f8abcc5167ccad925f4de817513830dc8e379d58629320f991ea7a90c2fb3e7bce5121ce64774fbe32a8b6e37ec3293d4648de53696413e680a2ae0810dd6db22469852dfd09072166b39a460a6445c0dd586cdecf1c20c8ae5bbef7dd1b588d40ccd2017f6bb4e3bbdda26a7e3a59ff453e350a44bcb4cdd572eacea8fa6484bb8d6612aebf3c6f47d29be463542f5d9eaec2771bf64e6370740e0d8de75b1357f8721671af537d5d4040cb084eb4e2cc34d2466a0115af84e1b0042895983a1d06b89fb4ce6ea0486f3f3b823520ab82011a1d4b277227f8611560b1e7933fdcbb3a792b344525bda08839e151ce794b2f32c9b7a01fbac9e01cc87ebcc7d1f6cf0111c3a1e8aac71a908749d44fbd9ad0dadecbd50ada380339c32ac69136678df9317ce0b12b4ff79e59b743f5bb3af2d519ff27d9459cbf97222c15e6fc2a0f91fc719b941525fae59361ceb69cebc2a8645912baa8d1b6c1075ee3056a0c10d25065cb03a442e0ec6e0e1698db3b4c98a0be3278e9649f1f9532e0d392dfd3a0342b8971f21e1b0a74414ba3348cc5be7120c37632d8df359f8d9b992f2ee60b6f470fe3f11de54cda541edad891ce6279cfcd3e7e6f1618b166fd2c1d05848fd2c5f6fb2299f523f357a632762393a8353156cccd02acf081625a75ebb56e16369788d273ccde96629281b949d04c50901b71c65614e6c6c7bd327a140a45e1d006c3f27b9ac9aa53fd62a80f00bb25bfe235bdd2f671126905b2040222b6cbcf7ccd769c2b53113ec01640e3d338abbd602547adf0ba38209cf746ce7677afa1c52075606085cbfe4e8ae88dd87aaaf9b04cf9aa7e1948c25c02fb8a8c01c36ae4d6ebe1f990d4f869a65cdea03f09252dc208e69fb74e6132ce77e25b578fdfe33ac372e6";
class l {
  static get MODE() {
    return e;
  }
  static get PADDING() {
    return f;
  }
  static get TYPE() {
    return c$1;
  }
  constructor(c2, a2 = e.ECB, d2 = f.PKCS5) {
    if (!i$1(c2)) throw new Error("Key should be a string or an ArrayBuffer / Buffer");
    if (c2.length < 1 || c2.byteLength < 1) throw new Error("Key should not be empty");
    if (!o(e, a2)) throw new Error("Unsupported mode");
    if (!o(f, d2)) throw new Error("Unsupported padding");
    this.mode = a2, this.padding = d2, this.iv = null;
    const r2 = function() {
      const e2 = { p: [], s: [[], [], [], []] };
      let f2 = 0;
      for (let c3 = 0; c3 < 18; c3++) {
        const c4 = u.substring(f2, f2 + 8);
        f2 += 8, e2.p.push(Number(`0x${c4}`));
      }
      for (let c3 = 0; c3 < 4; c3++) for (let a3 = 0; a3 < 256; a3++) {
        const a4 = u.substring(f2, f2 + 8);
        f2 += 8, e2.s[c3].push(Number(`0x${a4}`));
      }
      return e2;
    }();
    this.p = r2.p, this.s = r2.s, c2 = function(e2) {
      if (e2.length >= 72) return e2;
      const f2 = [];
      for (; f2.length < 72; ) for (let c3 = 0; c3 < e2.length; c3++) f2.push(e2[c3]);
      return new Uint8Array(f2);
    }(h(c2));
    for (let e2 = 0, f2 = 0; e2 < 18; e2++, f2 += 4) {
      const a3 = t(c2[f2], c2[f2 + 1], c2[f2 + 2], c2[f2 + 3]);
      this.p[e2] = b(this.p[e2], a3);
    }
    let n2 = 0, s2 = 0;
    for (let e2 = 0; e2 < 18; e2 += 2) [n2, s2] = this._encryptBlock(n2, s2), this.p[e2] = n2, this.p[e2 + 1] = s2;
    for (let e2 = 0; e2 < 4; e2++) for (let f2 = 0; f2 < 256; f2 += 2) [n2, s2] = this._encryptBlock(n2, s2), this.s[e2][f2] = n2, this.s[e2][f2 + 1] = s2;
  }
  setIv(e2) {
    if (!i$1(e2)) throw new Error("IV should be a string or an ArrayBuffer / Buffer");
    if (8 !== (e2 = h(e2)).length) throw new Error("IV should be 8 byte length");
    this.iv = e2;
  }
  encode(c2) {
    if (!i$1(c2)) throw new Error("Encode data should be a string or an ArrayBuffer / Buffer");
    if (this.mode !== e.ECB && !this.iv) throw new Error("IV is not set");
    return c2 = function(e2, c3) {
      const a2 = 8 - e2.length % 8;
      if (8 === a2 && e2.length > 0 && c3 !== f.PKCS5) return e2;
      const b2 = new Uint8Array(e2.length + a2), d2 = [];
      let t2 = a2, r2 = 0;
      switch (c3) {
        case f.PKCS5:
          r2 = a2;
          break;
        case f.ONE_AND_ZEROS:
          d2.push(128), t2--;
          break;
        case f.SPACES:
          r2 = 32;
      }
      for (; t2 > 0; ) {
        if (c3 === f.LAST_BYTE && 1 === t2) {
          d2.push(a2);
          break;
        }
        d2.push(r2), t2--;
      }
      return b2.set(e2), b2.set(d2, e2.length), b2;
    }(h(c2), this.padding), this.mode === e.ECB ? this._encodeECB(c2) : this.mode === e.CBC ? this._encodeCBC(c2) : void 0;
  }
  decode(a2, b2 = c$1.STRING) {
    if (!i$1(a2)) throw new Error("Decode data should be a string or an ArrayBuffer / Buffer");
    if (this.mode !== e.ECB && !this.iv) throw new Error("IV is not set");
    if ((a2 = h(a2)).length % 8 != 0) throw new Error("Decoded data should be multiple of 8 bytes");
    switch (this.mode) {
      case e.ECB:
        a2 = this._decodeECB(a2);
        break;
      case e.CBC:
        a2 = this._decodeCBC(a2);
    }
    switch (a2 = function(e2, c2) {
      let a3 = 0;
      switch (c2) {
        case f.LAST_BYTE:
        case f.PKCS5: {
          const f2 = e2[e2.length - 1];
          f2 <= 8 && (a3 = f2);
          break;
        }
        case f.ONE_AND_ZEROS: {
          let f2 = 1;
          for (; f2 <= 8; ) {
            const c3 = e2[e2.length - f2];
            if (128 === c3) {
              a3 = f2;
              break;
            }
            if (0 !== c3) break;
            f2++;
          }
          break;
        }
        case f.NULL:
        case f.SPACES: {
          const b3 = c2 === f.SPACES ? 32 : 0;
          let d2 = 1;
          for (; d2 <= 8; ) {
            if (e2[e2.length - d2] !== b3) {
              a3 = d2 - 1;
              break;
            }
            d2++;
          }
          break;
        }
      }
      return e2.subarray(0, e2.length - a3);
    }(a2, this.padding), b2) {
      case c$1.UINT8_ARRAY:
        return a2;
      case c$1.STRING:
        return new TextDecoder().decode(a2);
      default:
        throw new Error("Unsupported return type");
    }
  }
  _encryptBlock(e2, f2) {
    for (let c2 = 0; c2 < 16; c2++) e2 = b(e2, this.p[c2]), f2 = b(f2, this._f(e2)), [e2, f2] = [f2, e2];
    return [e2, f2] = [f2, e2], f2 = b(f2, this.p[16]), [e2 = b(e2, this.p[17]), f2];
  }
  _decryptBlock(e2, f2) {
    for (let c2 = 17; c2 > 1; c2--) e2 = b(e2, this.p[c2]), f2 = b(f2, this._f(e2)), [e2, f2] = [f2, e2];
    return [e2, f2] = [f2, e2], f2 = b(f2, this.p[1]), [e2 = b(e2, this.p[0]), f2];
  }
  _f(e2) {
    const f2 = e2 >>> 24 & 255, c2 = e2 >>> 16 & 255, a2 = e2 >>> 8 & 255, t2 = 255 & e2;
    let r2 = d(this.s[0][f2], this.s[1][c2]);
    return r2 = b(r2, this.s[2][a2]), d(r2, this.s[3][t2]);
  }
  _encodeECB(e2) {
    const f2 = new Uint8Array(e2.length);
    for (let c2 = 0; c2 < e2.length; c2 += 8) {
      let a2 = t(e2[c2], e2[c2 + 1], e2[c2 + 2], e2[c2 + 3]), b2 = t(e2[c2 + 4], e2[c2 + 5], e2[c2 + 6], e2[c2 + 7]);
      [a2, b2] = this._encryptBlock(a2, b2), f2.set(r(a2), c2), f2.set(r(b2), c2 + 4);
    }
    return f2;
  }
  _encodeCBC(e2) {
    const f2 = new Uint8Array(e2.length);
    let c2 = t(this.iv[0], this.iv[1], this.iv[2], this.iv[3]), a2 = t(this.iv[4], this.iv[5], this.iv[6], this.iv[7]);
    for (let d2 = 0; d2 < e2.length; d2 += 8) {
      let n2 = t(e2[d2], e2[d2 + 1], e2[d2 + 2], e2[d2 + 3]), s2 = t(e2[d2 + 4], e2[d2 + 5], e2[d2 + 6], e2[d2 + 7]);
      [n2, s2] = [b(c2, n2), b(a2, s2)], [n2, s2] = this._encryptBlock(n2, s2), [c2, a2] = [n2, s2], f2.set(r(n2), d2), f2.set(r(s2), d2 + 4);
    }
    return f2;
  }
  _decodeECB(e2) {
    const f2 = new Uint8Array(e2.length);
    for (let c2 = 0; c2 < e2.length; c2 += 8) {
      let a2 = t(e2[c2], e2[c2 + 1], e2[c2 + 2], e2[c2 + 3]), b2 = t(e2[c2 + 4], e2[c2 + 5], e2[c2 + 6], e2[c2 + 7]);
      [a2, b2] = this._decryptBlock(a2, b2), f2.set(r(a2), c2), f2.set(r(b2), c2 + 4);
    }
    return f2;
  }
  _decodeCBC(e2) {
    const f2 = new Uint8Array(e2.length);
    let c2, a2, d2 = t(this.iv[0], this.iv[1], this.iv[2], this.iv[3]), n2 = t(this.iv[4], this.iv[5], this.iv[6], this.iv[7]);
    for (let s2 = 0; s2 < e2.length; s2 += 8) {
      let i = t(e2[s2], e2[s2 + 1], e2[s2 + 2], e2[s2 + 3]), o2 = t(e2[s2 + 4], e2[s2 + 5], e2[s2 + 6], e2[s2 + 7]);
      [c2, a2] = [i, o2], [i, o2] = this._decryptBlock(i, o2), [i, o2] = [b(d2, i), b(n2, o2)], [d2, n2] = [c2, a2], f2.set(r(i), s2), f2.set(r(o2), s2 + 4);
    }
    return f2;
  }
}
function md5(message) {
  const bytes = unescape(encodeURIComponent(message));
  const msgLen = bytes.length;
  const words = [];
  for (let i = 0; i < msgLen; i += 1) {
    words[i >> 2] = (words[i >> 2] || 0) | bytes.charCodeAt(i) << i % 4 * 8;
  }
  words[msgLen >> 2] = (words[msgLen >> 2] || 0) | 128 << msgLen % 4 * 8;
  const bitLen = msgLen * 8;
  const size = ((msgLen + 8 >> 6) + 1) * 16;
  words[size - 2] = bitLen;
  words[size - 1] = 0;
  for (let i = 0; i < size; i += 1) words[i] = words[i] || 0;
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  const S = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
  ];
  const K = new Array(64);
  for (let i = 0; i < 64; i += 1) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  }
  const rotl = (x, n2) => x << n2 | x >>> 32 - n2;
  for (let i = 0; i < size; i += 16) {
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let j = 0; j < 64; j += 1) {
      let F;
      let g;
      if (j < 16) {
        F = B & C | ~B & D;
        g = j;
      } else if (j < 32) {
        F = D & B | ~D & C;
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = 7 * j % 16;
      }
      const tmp = D;
      D = C;
      C = B;
      B = B + rotl(A + F + K[j] + words[i + g] | 0, S[j]) | 0;
      A = tmp;
    }
    a0 = a0 + A | 0;
    b0 = b0 + B | 0;
    c0 = c0 + C | 0;
    d0 = d0 + D | 0;
  }
  const toHex = (n2) => {
    let s2 = "";
    for (let i = 0; i < 4; i += 1) {
      s2 += (n2 >>> i * 8 & 255).toString(16).padStart(2, "0");
    }
    return s2;
  };
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}
const SUPPORTED_SCHEMAS = /* @__PURE__ */ new Set(["CA", "CC", "CE"]);
const CE_KEY_OBF_B64 = "YcVXxg16HMEjV0yKbgMRSQ==";
class BinaryReader {
  constructor(data) {
    this.data = data;
  }
  pos = 0;
  isEof() {
    return this.pos >= this.data.length;
  }
  readUint8() {
    if (this.isEof()) throw new Error("Unexpected end of HPS face stream");
    const v = this.data[this.pos];
    this.pos += 1;
    return v;
  }
  readUint16() {
    if (this.pos + 2 > this.data.length) {
      throw new Error("Unexpected end of HPS face stream");
    }
    const v = this.data[this.pos] | this.data[this.pos + 1] << 8;
    this.pos += 2;
    return v;
  }
  readUint32() {
    if (this.pos + 4 > this.data.length) {
      throw new Error("Unexpected end of HPS face stream");
    }
    const v = this.data[this.pos] | this.data[this.pos + 1] << 8 | this.data[this.pos + 2] << 16 | this.data[this.pos + 3] << 24;
    this.pos += 4;
    return v >>> 0;
  }
  remaining() {
    return Math.max(0, this.data.length - this.pos);
  }
}
function decodeBase64(text) {
  const cleaned = String(text || "").replace(/\s+/g, "");
  if (!cleaned) return new Uint8Array(0);
  const bin = atob(cleaned);
  const out2 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out2[i] = bin.charCodeAt(i);
  return out2;
}
function swapEndiannessInPlace(data) {
  for (let i = 0; i + 8 <= data.length; i += 8) {
    let t2 = data[i];
    data[i] = data[i + 3];
    data[i + 3] = t2;
    t2 = data[i + 1];
    data[i + 1] = data[i + 2];
    data[i + 2] = t2;
    t2 = data[i + 4];
    data[i + 4] = data[i + 7];
    data[i + 7] = t2;
    t2 = data[i + 5];
    data[i + 5] = data[i + 6];
    data[i + 6] = t2;
  }
}
function getBaseCeKey() {
  const raw = decodeBase64(CE_KEY_OBF_B64);
  const key = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) key[i] = raw[i] ^ 85;
  return key;
}
function packageLockHash(packageLockList) {
  const items = String(packageLockList || "").split(";").map((s2) => s2.trim()).filter(Boolean);
  if (items.length === 0) return "";
  const canonical = [...new Set(items)].sort().join(";") + ";";
  return md5(canonical).toUpperCase();
}
function scrambleKey(key) {
  const out2 = new Uint8Array(key.length);
  for (let i = 0; i < key.length; i += 1) {
    out2[i] = key[key.length - 1 - i] ^ 123;
  }
  return out2;
}
function buildCeKey(properties, scramble) {
  const base = getBaseCeKey();
  const ekid = properties.EKID || "1";
  const hash = packageLockHash(properties.PackageLockList || "");
  let key = base;
  if (ekid === "1" && hash) {
    const hashBytes = new TextEncoder().encode(hash);
    const merged = new Uint8Array(base.length + hashBytes.length);
    merged.set(base, 0);
    merged.set(hashBytes, base.length);
    key = merged;
  }
  return scramble ? scrambleKey(key) : key;
}
function decryptCeBuffer(encrypted, key, truncateSize) {
  let data;
  if (encrypted.length % 8 !== 0) {
    data = new Uint8Array(encrypted.length + (8 - encrypted.length % 8));
    data.set(encrypted);
  } else {
    data = new Uint8Array(encrypted);
  }
  swapEndiannessInPlace(data);
  const bf = new l(key, l.MODE.ECB, l.PADDING.NONE);
  const decrypted = bf.decode(data, l.TYPE.UINT8_ARRAY);
  swapEndiannessInPlace(decrypted);
  if (truncateSize > 0 && decrypted.length > truncateSize) {
    return decrypted.subarray(0, truncateSize);
  }
  return decrypted;
}
function adler32Swapped(data) {
  let a2 = 1;
  let b2 = 0;
  for (let i = 0; i < data.length; i += 1) {
    a2 = (a2 + data[i]) % 65521;
    b2 = (b2 + a2) % 65521;
  }
  const adler = (b2 << 16 | a2) >>> 0;
  return ((adler & 255) << 24 | (adler & 65280) << 8 | adler >>> 8 & 65280 | adler >>> 24) >>> 0;
}
function firstElement(xml, tag) {
  return xml.getElementsByTagName(tag)[0] || null;
}
function elementText(el) {
  return String(el?.textContent || "").trim();
}
function attrInt(el, name, fallback = 0) {
  if (!el) return fallback;
  const n2 = Number(el.getAttribute(name));
  return Number.isFinite(n2) ? n2 : fallback;
}
function readProperties(xml) {
  const out2 = {};
  const root = xml.documentElement;
  if (!root) return out2;
  for (let i = 0; i < root.childNodes.length; i += 1) {
    const node2 = root.childNodes[i];
    if (node2?.nodeType !== 1) continue;
    const el = node2;
    if (el.tagName !== "Properties") continue;
    const props = el.getElementsByTagName("Property");
    for (let j = 0; j < props.length; j += 1) {
      const p = props[j];
      const name = p.getAttribute("name");
      const value = p.getAttribute("value");
      if (name != null && value != null) out2[name] = value;
    }
  }
  return out2;
}
function parseFaces(data, faceCount, vertexCount) {
  const errors = [];
  for (const mode of [16, 32]) {
    try {
      return parseFacesWithMode(data, faceCount, vertexCount, mode);
    } catch (e2) {
      errors.push(`${mode}-bit: ${e2 instanceof Error ? e2.message : String(e2)}`);
    }
  }
  throw new Error(
    `HPS face decode failed.
${errors.map((s2) => `  - ${s2}`).join("\n")}`
  );
}
function parseFacesWithMode(data, faceCount, vertexCount, mode) {
  const faces = [];
  let edgeList = [];
  let curEdge = 0;
  let globalVertexPtr = 0;
  const reader = new BinaryReader(data);
  const validate = (...indices) => {
    for (const v of indices) {
      if (v < 0 || v >= vertexCount) {
        throw new Error(
          `Vertex index ${v} out of bounds (0..${vertexCount - 1})`
        );
      }
    }
  };
  const createRestart = (v0, v1, v2) => {
    faces.push(v0, v1, v2);
    edgeList = [
      { start: v0, end: v1 },
      { start: v1, end: v2 },
      { start: v2, end: v0 }
    ];
    curEdge = 0;
  };
  const extendEdge = (v) => {
    if (edgeList.length === 0) throw new Error("No edges to extend");
    const ce = edgeList[curEdge];
    faces.push(v, ce.end, ce.start);
    const e1 = { start: ce.start, end: v };
    const e2 = { start: v, end: ce.end };
    edgeList.splice(curEdge, 1, e1, e2);
    curEdge = (curEdge + 2) % edgeList.length;
  };
  const handlePrevious = () => {
    if (edgeList.length < 2) throw new Error("Previous needs ≥2 edges");
    const n2 = edgeList.length;
    const prevIdx = (curEdge - 1 + n2) % n2;
    const pe = edgeList[prevIdx];
    const ce = edgeList[curEdge];
    faces.push(ce.start, pe.start, ce.end);
    const newEdge = { start: pe.start, end: ce.end };
    const high = Math.max(curEdge, prevIdx);
    const low = Math.min(curEdge, prevIdx);
    edgeList.splice(high, 1);
    edgeList.splice(low, 1);
    edgeList.splice(low, 0, newEdge);
    curEdge = (low + 1) % edgeList.length;
  };
  const handleNext = () => {
    if (edgeList.length < 2) throw new Error("Next needs ≥2 edges");
    const nextIdx = (curEdge + 1) % edgeList.length;
    const ce = edgeList[curEdge];
    const ne = edgeList[nextIdx];
    faces.push(ce.start, ne.end, ce.end);
    const newEdge = { start: ce.start, end: ne.end };
    const high = Math.max(curEdge, nextIdx);
    const low = Math.min(curEdge, nextIdx);
    edgeList.splice(high, 1);
    edgeList.splice(low, 1);
    edgeList.splice(low, 0, newEdge);
    curEdge = (low + 1) % edgeList.length;
  };
  const removeCurrent = () => {
    if (edgeList.length === 0) throw new Error("Cannot remove: empty edges");
    const n2 = edgeList.length;
    const prevIdx = (curEdge - 1 + n2) % n2;
    const pe = edgeList[prevIdx];
    const ce = edgeList[curEdge];
    if (pe.start === ce.end && n2 > 2) {
      const high = Math.max(curEdge, prevIdx);
      const low = Math.min(curEdge, prevIdx);
      edgeList.splice(high, 1);
      edgeList.splice(low, 1);
      if (edgeList.length > 0) {
        const newPrev = (low - 1 + edgeList.length) % edgeList.length;
        const newCurr = low % edgeList.length;
        edgeList[newPrev].end = edgeList[newCurr].start;
        curEdge = newCurr;
      } else {
        curEdge = 0;
      }
    } else {
      pe.end = ce.end;
      edgeList.splice(curEdge, 1);
      curEdge = edgeList.length ? curEdge % edgeList.length : 0;
    }
  };
  while (!reader.isEof()) {
    const commandByte = reader.readUint8();
    if (commandByte >> 4 !== 0) {
      throw new Error("Upper 4 bits of face command must be zero");
    }
    const op = commandByte & 15;
    switch (op) {
      case 0: {
        const v = globalVertexPtr;
        globalVertexPtr += 1;
        extendEdge(v);
        break;
      }
      case 1:
        handlePrevious();
        break;
      case 2:
        handleNext();
        break;
      case 3:
        curEdge = (curEdge + 1) % edgeList.length;
        break;
      case 4: {
        const v0 = globalVertexPtr;
        const v1 = globalVertexPtr + 1;
        const v2 = globalVertexPtr + 2;
        globalVertexPtr += 3;
        createRestart(v0, v1, v2);
        break;
      }
      case 5: {
        const v0 = mode === 32 ? reader.readUint32() : reader.readUint16();
        const v1 = mode === 32 ? reader.readUint32() : reader.readUint16();
        const v2 = mode === 32 ? reader.readUint32() : reader.readUint16();
        validate(v0, v1, v2);
        createRestart(v0, v1, v2);
        break;
      }
      case 6: {
        const v0 = reader.readUint32();
        const v1 = reader.readUint32();
        const v2 = reader.readUint32();
        validate(v0, v1, v2);
        createRestart(v0, v1, v2);
        break;
      }
      case 7: {
        const v = mode === 32 ? reader.readUint32() : reader.readUint16();
        validate(v);
        extendEdge(v);
        break;
      }
      case 8: {
        const v = reader.readUint32();
        validate(v);
        extendEdge(v);
        break;
      }
      case 9:
        removeCurrent();
        break;
      case 10:
        globalVertexPtr += 1;
        break;
      default:
        throw new Error(`Unknown face opcode ${op}`);
    }
  }
  if (faces.length / 3 !== faceCount) {
    throw new Error(
      `Face count mismatch: expected ${faceCount}, got ${faces.length / 3}`
    );
  }
  return Uint32Array.from(faces);
}
function isZipBuffer(buf) {
  const u8 = new Uint8Array(buf);
  return u8.length >= 4 && u8[0] === 80 && u8[1] === 75;
}
function looksLikeMedicalDicom(buf) {
  if (buf.byteLength < 132) return false;
  const u8 = new Uint8Array(buf);
  return u8[128] === 68 && u8[129] === 73 && u8[130] === 67 && u8[131] === 77;
}
async function extractHpsXmlText(buffer) {
  if (looksLikeMedicalDicom(buffer)) {
    throw new Error("의료 DICOM(.dcm)은 메시 프리뷰를 지원하지 않습니다.");
  }
  if (isZipBuffer(buffer)) {
    const { default: JSZip2 } = await Promise.resolve().then(() => index$1);
    const zip = await JSZip2.loadAsync(buffer);
    const names = Object.keys(zip.files);
    const preferred = names.find((n2) => /\.(hps|xml|dcm)$/i.test(n2) && !zip.files[n2].dir) || names.find((n2) => !zip.files[n2].dir);
    if (!preferred) throw new Error("ZIP DCM 안에 HPS 데이터가 없습니다.");
    const text2 = await zip.files[preferred].async("string");
    if (!/<HPS[\s>]/i.test(text2)) {
      throw new Error("ZIP DCM에서 HPS XML을 찾지 못했습니다.");
    }
    return text2;
  }
  const text = new TextDecoder().decode(buffer);
  if (!/<HPS[\s>]/i.test(text)) {
    throw new Error("3Shape HPS DCM이 아닙니다.");
  }
  return text;
}
const OUTSIDE_RANGE_BIT = 32768;
const COORD_MASK = 32767;
const SCALE_INSIDE = 1 / 32767;
const SCALE_OUTSIDE = 512 / 32767;
const NO_UV_MARKER = 4294967295;
function attrIntOptional(el, name) {
  if (!el) return null;
  const raw = el.getAttribute(name);
  if (raw == null || raw === "") return null;
  const n2 = Number(raw);
  return Number.isFinite(n2) ? n2 : null;
}
function packedRgb(color) {
  return [color >> 16 & 255, color >> 8 & 255, color & 255];
}
function fillUniformColors(count, rgb) {
  const out2 = new Uint8Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    out2[i * 3] = rgb[0];
    out2[i * 3 + 1] = rgb[1];
    out2[i * 3 + 2] = rgb[2];
  }
  return out2;
}
function readEncryptedOrPlain(el, encrypted) {
  if (!el) return null;
  const data = decodeBase64(elementText(el));
  if (!data.length) return null;
  if (!encrypted) return data;
  const sizeAttr = el.getAttribute("Base64EncodedBytes") || el.getAttribute("base64_encoded_bytes");
  const originalSize = sizeAttr != null ? Number(sizeAttr) : 0;
  return {
    data,
    originalSize: Number.isFinite(originalSize) && originalSize > 0 ? originalSize : 0,
    scramble: el.getAttribute("Key") != null
  };
}
function resolveCeBytes(blob2, properties) {
  if (!blob2) return null;
  if (blob2 instanceof Uint8Array) return blob2;
  const key = buildCeKey(properties, blob2.scramble);
  return decryptCeBuffer(blob2.data, key, blob2.originalSize);
}
function decompressUvComponent(bits) {
  const value = bits & COORD_MASK;
  if (bits & OUTSIDE_RANGE_BIT) return value * SCALE_OUTSIDE - 256;
  return value * SCALE_INSIDE;
}
function decompressTextureCoord(compressed) {
  const u2 = decompressUvComponent(compressed & 65535);
  const v = decompressUvComponent(compressed >>> 16 & 65535);
  return [u2, v];
}
function parseTextureCoords(data, vertexCount, indices) {
  const faceCount = indices.length / 3;
  const vertexCorners = Array.from({ length: vertexCount }, () => []);
  for (let corner = 0; corner < indices.length; corner += 1) {
    const v = indices[corner];
    vertexCorners[v].push(corner);
  }
  const uvs = new Float32Array(faceCount * 3 * 2);
  const reader = new BinaryReader(data);
  for (let vertexIdx = 0; vertexIdx < vertexCount; vertexIdx += 1) {
    if (reader.isEof()) {
      throw new Error(
        `Unexpected end of texture UV at vertex ${vertexIdx}/${vertexCount}`
      );
    }
    const flag = reader.readUint8();
    const corners = vertexCorners[vertexIdx];
    const writeUv = (cornerIdx, u2, v) => {
      const o2 = cornerIdx * 2;
      uvs[o2] = u2;
      uvs[o2 + 1] = v;
    };
    if (flag === 1) {
      const compressed = reader.readUint32();
      if (compressed !== NO_UV_MARKER) {
        const [u2, v] = decompressTextureCoord(compressed);
        for (const cornerIdx of corners) writeUv(cornerIdx, u2, v);
      }
    } else {
      let uvCount = flag === 255 ? corners.length : flag;
      let sharedRecover = false;
      if (flag !== 255 && flag !== corners.length) {
        const remaining = reader.remaining();
        if (corners.length > 0 && corners.length * 4 === remaining) {
          uvCount = corners.length;
        } else if (remaining === 4 && corners.length > 0) {
          sharedRecover = true;
          uvCount = 1;
        } else {
          throw new Error(
            `UV flag mismatch at vertex ${vertexIdx}: flag=${flag}, corners=${corners.length}`
          );
        }
      }
      if (sharedRecover) {
        const compressed = reader.readUint32();
        if (compressed !== NO_UV_MARKER) {
          const [u2, v] = decompressTextureCoord(compressed);
          for (const cornerIdx of corners) writeUv(cornerIdx, u2, v);
        }
      } else {
        const sorted = [...corners].sort(
          (a2, b2) => Math.floor(a2 / 3) - Math.floor(b2 / 3)
        );
        for (let i = 0; i < uvCount; i += 1) {
          const compressed = reader.readUint32();
          const cornerIdx = sorted[i];
          if (cornerIdx == null) continue;
          if (compressed !== NO_UV_MARKER) {
            const [u2, v] = decompressTextureCoord(compressed);
            writeUv(cornerIdx, u2, v);
          }
        }
      }
    }
  }
  return uvs;
}
function parseVertexColorBytes(data, vertexCount) {
  if (vertexCount <= 0 || data.length < vertexCount * 3) return null;
  const bpp = Math.floor(data.length / vertexCount);
  if (bpp === 3) {
    const out2 = new Uint8Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) {
      const o2 = i * 3;
      out2[o2] = data[o2 + 2];
      out2[o2 + 1] = data[o2 + 1];
      out2[o2 + 2] = data[o2];
    }
    return out2;
  }
  if (bpp === 4) {
    const out2 = new Uint8Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) {
      const s2 = i * 4;
      const o2 = i * 3;
      out2[o2] = data[s2 + 2];
      out2[o2 + 1] = data[s2 + 1];
      out2[o2 + 2] = data[s2];
    }
    return out2;
  }
  return null;
}
let jpegDecoder = decodeJpegRgbInBrowser;
function setHpsJpegDecoder(decoder) {
  jpegDecoder = decoder;
}
function decodeJpegRgb(jpegBytes) {
  return jpegDecoder(jpegBytes);
}
async function decodeJpegRgbInBrowser(jpegBytes) {
  const copy = new Uint8Array(jpegBytes.byteLength);
  copy.set(jpegBytes);
  const blob2 = new Blob([copy.buffer], { type: "image/jpeg" });
  const bitmap = await createImageBitmap(blob2);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable for DCM texture");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      rgba: imageData.data
    };
  } finally {
    bitmap.close();
  }
}
async function bakeTextureToVertexColors(indices, cornerUvs, jpegBytes, vertexCount) {
  const { width, height, rgba } = await decodeJpegRgb(jpegBytes);
  const sums = new Float32Array(vertexCount * 3);
  const counts = new Uint32Array(vertexCount);
  for (let corner = 0; corner < indices.length; corner += 1) {
    const vIdx = indices[corner];
    const u2 = cornerUvs[corner * 2];
    const v = cornerUvs[corner * 2 + 1];
    const x = Math.min(width - 1, Math.max(0, Math.round(u2 * (width - 1))));
    const y = Math.min(height - 1, Math.max(0, Math.round(v * (height - 1))));
    const p = (y * width + x) * 4;
    const o2 = vIdx * 3;
    sums[o2] += rgba[p + 2];
    sums[o2 + 1] += rgba[p + 1];
    sums[o2 + 2] += rgba[p];
    counts[vIdx] += 1;
  }
  const out2 = new Uint8Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const c2 = counts[i];
    const o2 = i * 3;
    if (c2 > 0) {
      out2[o2] = Math.round(sums[o2] / c2);
      out2[o2 + 1] = Math.round(sums[o2 + 1] / c2);
      out2[o2 + 2] = Math.round(sums[o2 + 2] / c2);
    } else {
      out2[o2] = 128;
      out2[o2 + 1] = 128;
      out2[o2 + 2] = 128;
    }
  }
  return out2;
}
function faceTintToVertexColors(indices, faceRgb, vertexCount) {
  return fillUniformColors(vertexCount, faceRgb);
}
function collectTextureImages(xml, schema, properties) {
  const isCe = schema === "CE";
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  const pushResolved = (el, encryptable) => {
    if (seen.has(el)) return;
    seen.add(el);
    const raw = readEncryptedOrPlain(el, isCe && encryptable);
    const resolved = resolveCeBytes(raw, properties);
    if (resolved && resolved.length > 0) out2.push(resolved);
  };
  for (const el of Array.from(
    xml.querySelectorAll(
      "TextureData2 > TextureImages > AdditionalTextureImage, TextureData > TextureImages > AdditionalTextureImage, PartialTextureData > TextureImages > TextureImage"
    )
  )) {
    pushResolved(el, true);
  }
  for (const el of Array.from(xml.querySelectorAll("TextureImages > TextureImage"))) {
    pushResolved(el, false);
  }
  return out2;
}
async function resolveVertexColors(options) {
  const {
    xml,
    schema,
    properties,
    indices,
    vertexCount,
    verticesEl,
    facetsEl
  } = options;
  const isCe = schema === "CE";
  const texCoordEl = xml.getElementsByTagName("PerVertexTextureCoord")[0] || null;
  const texCoordRaw = readEncryptedOrPlain(texCoordEl, isCe);
  const texCoordBytes = resolveCeBytes(texCoordRaw, properties);
  const textureImages = collectTextureImages(xml, schema, properties);
  if (texCoordBytes && textureImages.length > 0) {
    try {
      const cornerUvs = parseTextureCoords(texCoordBytes, vertexCount, indices);
      return await bakeTextureToVertexColors(
        indices,
        cornerUvs,
        textureImages[0],
        vertexCount
      );
    } catch (err2) {
      console.warn("[hpsDcm] texture bake failed; falling back", err2);
    }
  }
  const vColorEl = xml.querySelector("VertexColorSets > VertexColorSet") || xml.getElementsByTagName("VertexColorSet")[0] || null;
  const vColorRaw = readEncryptedOrPlain(vColorEl, isCe);
  const vColorBytes = resolveCeBytes(vColorRaw, properties);
  if (vColorBytes) {
    const parsed = parseVertexColorBytes(vColorBytes, vertexCount);
    if (parsed) return parsed;
  }
  const vertexTint = attrIntOptional(verticesEl, "color");
  if (vertexTint != null) {
    return fillUniformColors(vertexCount, packedRgb(vertexTint >>> 0));
  }
  const faceTint = attrIntOptional(facetsEl, "color");
  if (faceTint != null) {
    return faceTintToVertexColors(indices, packedRgb(faceTint >>> 0), vertexCount);
  }
  return null;
}
function colorsToThreeAttribute(colors) {
  const count = colors.length / 3;
  const arr = new Float32Array(count * 3);
  const tmp = new Color();
  for (let i = 0; i < count; i += 1) {
    tmp.setRGB(
      colors[i * 3] / 255,
      colors[i * 3 + 1] / 255,
      colors[i * 3 + 2] / 255,
      SRGBColorSpace
    );
    arr[i * 3] = tmp.r;
    arr[i * 3 + 1] = tmp.g;
    arr[i * 3 + 2] = tmp.b;
  }
  return new BufferAttribute(arr, 3);
}
async function parseHpsDcmMeshData(buffer) {
  const xmlText = await extractHpsXmlText(buffer);
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) {
    throw new Error("HPS XML 파싱에 실패했습니다.");
  }
  const schema = elementText(firstElement(xml, "Schema")).toUpperCase();
  if (!SUPPORTED_SCHEMAS.has(schema)) {
    throw new Error(`지원하지 않는 HPS 스키마: ${schema || "(없음)"}`);
  }
  const verticesEl = firstElement(xml, "Vertices");
  const facetsEl = firstElement(xml, "Facets");
  if (!verticesEl || !facetsEl) {
    throw new Error("HPS Vertices/Facets가 없습니다.");
  }
  const vertexCount = attrInt(verticesEl, "vertex_count");
  const faceCount = attrInt(facetsEl, "facet_count");
  if (vertexCount <= 0 || faceCount <= 0) {
    throw new Error("HPS vertex/face count가 올바르지 않습니다.");
  }
  const properties = readProperties(xml);
  let vertexBytes = decodeBase64(elementText(verticesEl));
  const faceBytes = decodeBase64(elementText(facetsEl));
  const expectedVertexBytes = vertexCount * 3 * 4;
  if (schema === "CE") {
    const key = buildCeKey(properties, false);
    vertexBytes = decryptCeBuffer(vertexBytes, key, expectedVertexBytes);
    const checkRaw = verticesEl.getAttribute("check_value");
    if (checkRaw) {
      const expected = Number(checkRaw) >>> 0;
      const got = adler32Swapped(vertexBytes);
      if (expected !== got) {
        throw new Error("HPS CE 무결성 검사 실패(복호화 키 불일치).");
      }
    }
  } else if (vertexBytes.byteLength < expectedVertexBytes) {
    throw new Error("HPS vertex 버퍼가 너무 짧습니다.");
  } else if (vertexBytes.byteLength > expectedVertexBytes) {
    vertexBytes = vertexBytes.subarray(0, expectedVertexBytes);
  }
  const positions = new Float32Array(vertexCount * 3);
  positions.set(
    new Float32Array(
      vertexBytes.buffer,
      vertexBytes.byteOffset,
      vertexCount * 3
    )
  );
  const indices = parseFaces(faceBytes, faceCount, vertexCount);
  const colors = await resolveVertexColors({
    xml,
    schema,
    properties,
    indices,
    vertexCount,
    verticesEl,
    facetsEl
  });
  return {
    positions,
    indices,
    colors,
    workCopy: properties["abuts.work"] === "1"
  };
}
async function parseHpsDcmGeometry(buffer) {
  const mesh = await parseHpsDcmMeshData(buffer);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  if (mesh.colors) {
    geometry.setAttribute("color", colorsToThreeAttribute(mesh.colors));
  }
  if (mesh.workCopy) geometry.userData.abutsWork = true;
  geometry.computeVertexNormals();
  return geometry;
}
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|bmp|gif)$/i;
function getModelExtLower(name) {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
}
function modelFileBasename(pathOrName, fallback = "model.stl") {
  const raw = String(pathOrName || "").trim();
  if (!raw) return fallback;
  const base = raw.split("/").pop() || raw;
  return base.trim() || fallback;
}
function fileStemLower(name) {
  const base = modelFileBasename(name, "").toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
function geometryHasVertexColors(geometry) {
  if (!geometry) return false;
  const color = geometry.getAttribute("color");
  return Boolean(color && color.count > 0);
}
function geometryHasUv(geometry) {
  if (!geometry) return false;
  const uv = geometry.getAttribute("uv");
  return Boolean(uv && uv.count > 0);
}
const SCAN_COLOR_CONTRAST = 1.22;
const SCAN_COLOR_SATURATION = 1.06;
const SCAN_COLOR_BRIGHTNESS = 1.12;
const GUM_PINK_R = 0.91;
const GUM_PINK_G = 0.769;
const GUM_PINK_B = 0.8;
const TOOTH_WHITE_R = 0.98;
const TOOTH_WHITE_G = 0.976;
const TOOTH_WHITE_B = 0.969;
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function enhanceScanSrgbChannels(r0, g0, b0) {
  let r2 = clamp01(0.5 + (r0 - 0.5) * SCAN_COLOR_CONTRAST);
  let g = clamp01(0.5 + (g0 - 0.5) * SCAN_COLOR_CONTRAST);
  let b2 = clamp01(0.5 + (b0 - 0.5) * SCAN_COLOR_CONTRAST);
  const luma = 0.2126 * r2 + 0.7152 * g + 0.0722 * b2;
  r2 = clamp01(luma + (r2 - luma) * SCAN_COLOR_SATURATION);
  g = clamp01(luma + (g - luma) * SCAN_COLOR_SATURATION);
  b2 = clamp01(luma + (b2 - luma) * SCAN_COLOR_SATURATION);
  const maxc = Math.max(r2, g, b2);
  const minc = Math.min(r2, g, b2);
  const sat = maxc > 1e-5 ? (maxc - minc) / maxc : 0;
  const warm = clamp01((r2 - b2) * 4.2);
  const midLuma = clamp01(1 - Math.abs(luma - 0.48) / 0.34);
  const notBrightTooth = luma < 0.7 ? 1 : clamp01((0.86 - luma) / 0.16);
  let gumW = warm * midLuma * notBrightTooth;
  if (r2 + 0.02 < g) gumW *= 0.3;
  gumW = clamp01(gumW);
  let toothW = 0;
  if (luma > 0.4) {
    const bright = clamp01((luma - 0.4) / 0.38);
    const lowSat = clamp01(1 - sat / 0.38);
    toothW = bright * Math.max(lowSat, 0.4) * (1 - gumW * 0.9);
  }
  if (gumW > 0.02) {
    const t2 = gumW * 0.52;
    r2 = clamp01(r2 + (GUM_PINK_R - r2) * t2);
    g = clamp01(g + (GUM_PINK_G - g) * t2);
    b2 = clamp01(b2 + (GUM_PINK_B - b2) * t2);
  }
  if (toothW > 0.02) {
    const t2 = toothW * 0.68;
    r2 = clamp01(r2 + (TOOTH_WHITE_R - r2) * t2);
    g = clamp01(g + (TOOTH_WHITE_G - g) * t2);
    b2 = clamp01(b2 + (TOOTH_WHITE_B - b2) * t2);
  }
  r2 = clamp01(r2 * SCAN_COLOR_BRIGHTNESS);
  g = clamp01(g * SCAN_COLOR_BRIGHTNESS);
  b2 = clamp01(b2 * SCAN_COLOR_BRIGHTNESS);
  return [r2, g, b2];
}
function enhanceScanVertexColors(geometry) {
  const color = geometry.getAttribute("color");
  if (!color || color.count <= 0) return;
  const tmp = new Color();
  for (let i = 0; i < color.count; i += 1) {
    tmp.setRGB(
      color.getX(i),
      color.getY(i),
      color.getZ(i),
      LinearSRGBColorSpace
    );
    tmp.convertLinearToSRGB();
    const [r2, g, b2] = enhanceScanSrgbChannels(tmp.r, tmp.g, tmp.b);
    tmp.setRGB(r2, g, b2, SRGBColorSpace);
    color.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  color.needsUpdate = true;
}
function enhanceScanTextureContrast(texture) {
  const image = texture.image;
  if (!image) return;
  const w = Number(image.width) || 0;
  const h2 = Number(image.height) || 0;
  if (!(w > 0 && h2 > 0)) return;
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  try {
    ctx.drawImage(image, 0, 0);
  } catch {
    return;
  }
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h2);
  } catch {
    return;
  }
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const [r2, g, b2] = enhanceScanSrgbChannels(
      px[i] / 255,
      px[i + 1] / 255,
      px[i + 2] / 255
    );
    px[i] = Math.round(r2 * 255);
    px[i + 1] = Math.round(g * 255);
    px[i + 2] = Math.round(b2 * 255);
  }
  ctx.putImageData(data, 0, 0);
  texture.image = canvas;
  texture.needsUpdate = true;
}
function enhanceScanPreviewColors(geometry, texture) {
  if (geometryHasVertexColors(geometry)) {
    enhanceScanVertexColors(geometry);
  }
  if (texture) {
    enhanceScanTextureContrast(texture);
  }
}
async function loadTextureFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const texture = await new TextureLoader().loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function peekPlyHeaderInfo(buffer) {
  const bytes = new Uint8Array(buffer);
  const max = Math.min(bytes.length, 256 * 1024);
  let headerEnd = -1;
  const marker = "end_header";
  let text = "";
  {
    const slice = bytes.subarray(0, max);
    text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      headerEnd = idx + marker.length;
      let end = headerEnd;
      while (end < text.length && (text[end] === "\r" || text[end] === "\n")) {
        end += 1;
      }
      text = text.slice(0, end);
    } else {
      text = text.slice(0, Math.min(text.length, 8 * 1024));
    }
  }
  let textureFileName = null;
  const propertyNames = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith("comment") && lower.includes("texturefile")) {
      const at = lower.indexOf("texturefile");
      const name = line.slice(at + "texturefile".length).trim();
      if (name) textureFileName = modelFileBasename(name, name);
      continue;
    }
    if (lower.startsWith("property")) {
      const parts = line.split(/\s+/);
      const name = parts[1]?.toLowerCase() === "list" ? parts[4] : parts.length >= 3 ? parts[parts.length - 1] : "";
      if (name) propertyNames.push(name);
    }
  }
  return { textureFileName, propertyNames, headerText: text };
}
function scanKindToken(name) {
  const stem = fileStemLower(name).replace(/[\s_-]+/g, "");
  const tokens = [
    "upperjawscan",
    "lowerjawscan",
    "bitescan",
    "preopscan",
    "upperjaw",
    "lowerjaw",
    "bite"
  ];
  for (const token of tokens) {
    if (stem.includes(token)) return token;
  }
  return stem;
}
function buildPlyPropertyMapping(propertyNames) {
  const mapping = {};
  const find = (...cands) => propertyNames.find((n2) => cands.includes(n2.toLowerCase()));
  const red = find(
    "red",
    "diffuse_red",
    "ambient_red",
    "r",
    "diffuse_r",
    "ambient_r"
  );
  const green = find(
    "green",
    "diffuse_green",
    "ambient_green",
    "g",
    "diffuse_g",
    "ambient_g"
  );
  const blue = find(
    "blue",
    "diffuse_blue",
    "ambient_blue",
    "b",
    "diffuse_b",
    "ambient_b"
  );
  if (red && red.toLowerCase() !== "red") mapping[red] = "red";
  if (green && green.toLowerCase() !== "green") mapping[green] = "green";
  if (blue && blue.toLowerCase() !== "blue") mapping[blue] = "blue";
  for (const n2 of propertyNames) {
    const lower = n2.toLowerCase();
    if (lower === "red" && n2 !== "red") mapping[n2] = "red";
    if (lower === "green" && n2 !== "green") mapping[n2] = "green";
    if (lower === "blue" && n2 !== "blue") mapping[n2] = "blue";
    if ((lower === "texture_u" || lower === "texture_v" || lower === "texture_s" || lower === "texture_t" || lower === "s" || lower === "t" || lower === "u" || lower === "v" || lower === "tx" || lower === "ty") && n2 !== lower) {
      if (lower === "texture_s") mapping[n2] = "texture_u";
      else if (lower === "texture_t") mapping[n2] = "texture_v";
      else mapping[n2] = lower;
    }
  }
  return mapping;
}
function resolveCompanionTextureFileName(modelFileName, preferredTextureName, candidateFileNames) {
  const candidates = (candidateFileNames || []).map((n2) => String(n2 || "").trim()).filter((n2) => n2 && IMAGE_EXT_RE.test(n2));
  if (!candidates.length) return null;
  const byBase = /* @__PURE__ */ new Map();
  for (const name of candidates) {
    byBase.set(modelFileBasename(name).toLowerCase(), name);
  }
  const preferred = preferredTextureName ? modelFileBasename(preferredTextureName).toLowerCase() : "";
  if (preferred && byBase.has(preferred)) return byBase.get(preferred);
  if (preferred) {
    const preferredStem = fileStemLower(preferred);
    const byPreferredStem = candidates.find(
      (n2) => fileStemLower(n2) === preferredStem
    );
    if (byPreferredStem) return byPreferredStem;
    const preferredToken = scanKindToken(preferred);
    if (preferredToken) {
      const byPreferredToken = candidates.find(
        (n2) => scanKindToken(n2) === preferredToken
      );
      if (byPreferredToken) return byPreferredToken;
    }
    const fuzzyPreferred = candidates.find((n2) => {
      const s2 = fileStemLower(n2);
      return s2.includes(preferredStem) || preferredStem.includes(s2);
    });
    if (fuzzyPreferred) return fuzzyPreferred;
  }
  const stem = fileStemLower(modelFileName);
  if (stem) {
    const exactStem = candidates.find((n2) => fileStemLower(n2) === stem);
    if (exactStem) return exactStem;
  }
  const modelToken = scanKindToken(modelFileName);
  if (modelToken) {
    const byToken = candidates.find((n2) => scanKindToken(n2) === modelToken);
    if (byToken) return byToken;
  }
  if (stem) {
    const fuzzy = candidates.find((n2) => {
      const s2 = fileStemLower(n2);
      return s2.includes(stem) || stem.includes(s2);
    });
    if (fuzzy) return fuzzy;
  }
  return null;
}
function peekObjMaterialRefs(objText) {
  let mtlFileName = null;
  const mapKdNames = [];
  for (const rawLine of objText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const tag = (parts[0] || "").toLowerCase();
    if (tag === "mtllib" && parts[1]) {
      mtlFileName = modelFileBasename(parts.slice(1).join(" "));
    }
  }
  return { mtlFileName, mapKdNames };
}
function peekMtlMapKdNames(mtlText) {
  const names = [];
  for (const rawLine of mtlText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if ((parts[0] || "").toLowerCase() === "map_kd" && parts[1]) {
      names.push(modelFileBasename(parts.slice(1).join(" ")));
    }
  }
  return names;
}
async function parseModelPreview(file, options = {}) {
  const buffer = await file.arrayBuffer();
  const ext = getModelExtLower(file.name);
  const companionFiles = Array.isArray(options.companionFiles) ? options.companionFiles : [];
  const companionByBase = /* @__PURE__ */ new Map();
  for (const f2 of companionFiles) {
    companionByBase.set(modelFileBasename(f2.name).toLowerCase(), f2);
  }
  const resolveTextureFile = (preferred) => {
    if (options.textureFile) return options.textureFile;
    const matchedName = resolveCompanionTextureFileName(
      file.name,
      preferred,
      companionFiles.map((f2) => f2.name)
    );
    if (!matchedName) return null;
    return companionByBase.get(modelFileBasename(matchedName).toLowerCase()) || null;
  };
  if (ext === ".dcm") {
    const geometry = await parseHpsDcmGeometry(buffer);
    if (!geometry.userData.abutsWork) {
      enhanceScanPreviewColors(geometry, null);
    }
    return { geometry, texture: null, textureFileName: null };
  }
  if (ext === ".ply") {
    const header = peekPlyHeaderInfo(buffer);
    const loader = new PLYLoader();
    const mapping = buildPlyPropertyMapping(header.propertyNames);
    if (Object.keys(mapping).length > 0) {
      loader.setPropertyNameMapping(mapping);
    }
    const geometry = loader.parse(buffer);
    normalizeVertexColorsIfNeeded(geometry);
    let texture = null;
    const texFile = resolveTextureFile(header.textureFileName);
    if (texFile && geometryHasUv(geometry)) {
      try {
        texture = await loadTextureFromFile(texFile);
      } catch {
        texture = null;
      }
    }
    enhanceScanPreviewColors(geometry, texture);
    return {
      geometry,
      texture,
      textureFileName: header.textureFileName
    };
  }
  if (ext === ".obj") {
    const text = new TextDecoder().decode(buffer);
    const { mtlFileName } = peekObjMaterialRefs(text);
    let preferredTex = null;
    let materials = null;
    if (mtlFileName) {
      const mtlFile = companionByBase.get(modelFileBasename(mtlFileName).toLowerCase()) || null;
      if (mtlFile) {
        const mtlText = await mtlFile.text();
        const mapKds = peekMtlMapKdNames(mtlText);
        preferredTex = mapKds[0] || null;
        try {
          const mtlLoader = new MTLLoader();
          materials = mtlLoader.parse(mtlText, "");
          materials.preload();
        } catch {
          materials = null;
        }
      }
    }
    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);
    const group = objLoader.parse(text);
    group.updateMatrixWorld(true);
    let texture = null;
    const texFile = resolveTextureFile(preferredTex);
    if (texFile) {
      try {
        texture = await loadTextureFromFile(texFile);
      } catch {
        texture = null;
      }
    }
    if (!texture) {
      group.traverse((child) => {
        if (texture) return;
        const mesh = child;
        if (!mesh.isMesh) return;
        const mat = mesh.material;
        if (mat && !Array.isArray(mat) && mat.map) {
          texture = mat.map;
        }
      });
    }
    const parts = [];
    group.traverse((child) => {
      const mesh = child;
      if (!mesh.isMesh || !mesh.geometry) return;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      parts.push(geo);
    });
    if (parts.length === 0) {
      throw new Error("OBJ에 표시할 메시가 없습니다.");
    }
    let geometry;
    if (parts.length === 1) {
      geometry = parts[0];
    } else {
      const anyColor = parts.some((g) => geometryHasVertexColors(g));
      const anyUv = parts.some((g) => geometryHasUv(g));
      if (anyColor) {
        for (const g of parts) {
          if (geometryHasVertexColors(g)) continue;
          const pos = g.getAttribute("position");
          if (!pos) continue;
          const colors = new Float32Array(pos.count * 3);
          colors.fill(1);
          g.setAttribute("color", new BufferAttribute(colors, 3));
        }
      }
      if (anyUv) {
        for (const g of parts) {
          if (geometryHasUv(g)) continue;
          const pos = g.getAttribute("position");
          if (!pos) continue;
          g.setAttribute(
            "uv",
            new BufferAttribute(new Float32Array(pos.count * 2), 2)
          );
        }
      }
      const merged = mergeGeometries$1(parts, false);
      if (!merged) throw new Error("OBJ 메시를 합치지 못했습니다.");
      geometry = merged;
    }
    normalizeVertexColorsIfNeeded(geometry);
    if (texture && !geometryHasUv(geometry)) {
      if (!geometryHasVertexColors(geometry)) ;
    }
    if (texture && !geometryHasUv(geometry)) {
      texture = null;
    }
    enhanceScanPreviewColors(geometry, texture);
    return { geometry, texture, textureFileName: preferredTex };
  }
  return {
    geometry: new STLLoader().parse(buffer),
    texture: null,
    textureFileName: null
  };
}
function normalizeVertexColorsIfNeeded(geometry) {
  const color = geometry.getAttribute("color");
  if (!color || color.count <= 0) return;
  let max = 0;
  const arr = color.array;
  for (let i = 0; i < arr.length; i += 1) {
    const v = Number(arr[i]);
    if (Number.isFinite(v) && v > max) max = v;
  }
  if (!(max > 0 && max <= 0.02)) return;
  const tmp = new Color();
  for (let i = 0; i < color.count; i += 1) {
    tmp.setRGB(
      color.getX(i),
      color.getY(i),
      color.getZ(i),
      LinearSRGBColorSpace
    );
    tmp.convertLinearToSRGB();
    const r2 = Math.min(1, Math.max(0, tmp.r * 255));
    const g = Math.min(1, Math.max(0, tmp.g * 255));
    const b2 = Math.min(1, Math.max(0, tmp.b * 255));
    tmp.setRGB(r2, g, b2, SRGBColorSpace);
    color.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  color.needsUpdate = true;
}
function abutsWorkScanFileName(role, index2 = 0) {
  const label = oralScanRoleLabel(role);
  if (index2 <= 0) return `${label}-작업.dcm`;
  return `${label}-작업-${index2 + 1}.dcm`;
}
function oralScanRoleLabel(role) {
  if (role === "upper") return "상악";
  if (role === "lower") return "하악";
  if (role === "bite") return "바이트";
  return "그 외";
}
function samplePositions(geometry, cap) {
  const pos = geometry.getAttribute("position");
  const out2 = [];
  if (!pos || pos.count === 0) return out2;
  const stride = Math.max(1, Math.floor(pos.count / cap));
  for (let i = 0; i < pos.count; i += stride) {
    out2.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  return out2;
}
function meanVec(points) {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n2 = points.length;
  return new Vector3(x / n2, y / n2, z / n2);
}
function extractBoundaryVertices(geometry) {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count === 0) return [];
  const index2 = geometry.index;
  const triCount = index2 ? Math.floor(index2.count / 3) : Math.floor(pos.count / 3);
  const edgeCount = /* @__PURE__ */ new Map();
  for (let t2 = 0; t2 < triCount; t2 += 1) {
    const a2 = index2 ? index2.getX(t2 * 3) : t2 * 3;
    const b2 = index2 ? index2.getX(t2 * 3 + 1) : t2 * 3 + 1;
    const c2 = index2 ? index2.getX(t2 * 3 + 2) : t2 * 3 + 2;
    const e1 = a2 < b2 ? `${a2}_${b2}` : `${b2}_${a2}`;
    const e2 = b2 < c2 ? `${b2}_${c2}` : `${c2}_${b2}`;
    const e3 = c2 < a2 ? `${c2}_${a2}` : `${a2}_${c2}`;
    edgeCount.set(e1, (edgeCount.get(e1) ?? 0) + 1);
    edgeCount.set(e2, (edgeCount.get(e2) ?? 0) + 1);
    edgeCount.set(e3, (edgeCount.get(e3) ?? 0) + 1);
  }
  const pts = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [key, count] of edgeCount.entries()) {
    if (count === 1) {
      const parts = key.split("_");
      const u2 = Number(parts[0]);
      const v = Number(parts[1]);
      if (u2 !== void 0 && !seen.has(u2)) {
        seen.add(u2);
        pts.push([pos.getX(u2), pos.getY(u2), pos.getZ(u2)]);
      }
      if (v !== void 0 && !seen.has(v)) {
        seen.add(v);
        pts.push([pos.getX(v), pos.getY(v), pos.getZ(v)]);
      }
    }
  }
  return pts;
}
function computeMeshNormalVoting(geometry) {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count < 3) return new Vector3(0, 0, 1);
  const index2 = geometry.index;
  const triCount = index2 ? Math.floor(index2.count / 3) : Math.floor(pos.count / 3);
  const sumN = new Vector3();
  const v1 = new Vector3();
  const v2 = new Vector3();
  const n2 = new Vector3();
  for (let t2 = 0; t2 < triCount; t2 += 1) {
    const ia = index2 ? index2.getX(t2 * 3) : t2 * 3;
    const ib = index2 ? index2.getX(t2 * 3 + 1) : t2 * 3 + 1;
    const ic = index2 ? index2.getX(t2 * 3 + 2) : t2 * 3 + 2;
    v1.set(
      pos.getX(ib) - pos.getX(ia),
      pos.getY(ib) - pos.getY(ia),
      pos.getZ(ib) - pos.getZ(ia)
    );
    v2.set(
      pos.getX(ic) - pos.getX(ia),
      pos.getY(ic) - pos.getY(ia),
      pos.getZ(ic) - pos.getZ(ia)
    );
    n2.crossVectors(v1, v2);
    sumN.add(n2);
  }
  if (sumN.lengthSq() > 1e-6) sumN.normalize();
  return sumN;
}
function spanUnitsToMm(points, mean) {
  let radius = 0;
  for (const p of points) {
    radius = Math.max(radius, Math.hypot(p[0] - mean.x, p[1] - mean.y, p[2] - mean.z));
  }
  if (radius > 0 && radius < 5) return 1e3;
  if (radius > 400) return 1e-3;
  return 1;
}
function crownDirection(mesh) {
  const pts = samplePositions(mesh.geometry, 2500);
  const mean = meanVec(pts);
  if (!mean) return null;
  const border = extractBoundaryVertices(mesh.geometry);
  let toCrown = new Vector3();
  if (border.length >= 20) {
    const borderMean = meanVec(border);
    if (borderMean) toCrown.subVectors(mean, borderMean);
  }
  if (toCrown.lengthSq() < 1e-4) toCrown = computeMeshNormalVoting(mesh.geometry);
  if (toCrown.lengthSq() < 1e-4) return null;
  return toCrown.normalize();
}
function estimateDentalFrame(loaded) {
  const upperPts = [];
  const lowerPts = [];
  const archPts = [];
  let upperMesh = null;
  let lowerMesh = null;
  let singleMesh = null;
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 2500);
    archPts.push(...pts);
    if (entry.role === "upper") {
      upperPts.push(...pts);
      upperMesh = entry;
    } else {
      lowerPts.push(...pts);
      lowerMesh = entry;
    }
  }
  if (archPts.length < 30) {
    for (const entry of loaded) {
      if (entry.role === "bite") continue;
      const pts = samplePositions(entry.geometry, 2500);
      archPts.push(...pts);
      singleMesh = entry;
    }
  }
  if (archPts.length < 30) return null;
  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mean = meanVec(archPts);
  const both = upperPts.length >= 30 && lowerPts.length >= 30;
  const toMm = spanUnitsToMm(archPts, mean);
  let up = new Vector3();
  if (both && upperC && lowerC) {
    const delta = upperC.clone().sub(lowerC);
    if (delta.length() * toMm >= 3) up.copy(delta);
  }
  if (up.lengthSq() < 1e-4) {
    up = smallestPcaAxis(archPts, mean);
    if (both && upperC && lowerC && upperC.distanceToSquared(lowerC) > 1e-8) {
      if (up.dot(upperC.clone().sub(lowerC)) < 0) up.negate();
    } else {
      const single = upperMesh ?? lowerMesh ?? singleMesh;
      const crown = single ? crownDirection(single) : null;
      if (crown) {
        const expectedUp = upperMesh && !lowerMesh ? crown.clone().negate() : crown;
        if (up.dot(expectedUp) < 0) up.negate();
      }
    }
  }
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();
  const anterior = anteriorAxis(archPts, mean, up);
  const right = new Vector3().crossVectors(anterior, up).normalize();
  if (right.lengthSq() < 1e-8) return null;
  return { up, anterior, right };
}
function anteriorAxis(archPts, mean, up) {
  const tangent = Math.abs(up.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const axisA = new Vector3().crossVectors(up, tangent).normalize();
  const axisB = new Vector3().crossVectors(up, axisA).normalize();
  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  const proj = [];
  for (const p of archPts) {
    const dx = p[0] - mean.x;
    const dy = p[1] - mean.y;
    const dz = p[2] - mean.z;
    const a2 = dx * axisA.x + dy * axisA.y + dz * axisA.z;
    const b2 = dx * axisB.x + dy * axisB.y + dz * axisB.z;
    proj.push({ a: a2, b: b2 });
    cxx += a2 * a2;
    cxy += a2 * b2;
    cyy += b2 * b2;
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const lAlong = cxx * ct * ct + 2 * cxy * ct * st + cyy * st * st;
  const lAcross = cxx * st * st - 2 * cxy * ct * st + cyy * ct * ct;
  let major = new Vector2(ct, st);
  let minor = new Vector2(-st, ct);
  if (lAcross > lAlong) {
    major = new Vector2(-st, ct);
    minor = new Vector2(ct, st);
  }
  const evalAxis = (axisVec, perpVec) => {
    const scores = proj.map((p) => p.a * axisVec.x + p.b * axisVec.y);
    const sorted = [...scores].sort((a2, b2) => a2 - b2);
    const loCut = sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0] ?? 0;
    const hiCut = sorted[Math.floor(sorted.length * 0.9)] ?? sorted[sorted.length - 1] ?? 0;
    const spread = (side) => {
      let n2 = 0;
      let sum = 0;
      let sum2 = 0;
      for (let i = 0; i < proj.length; i += 1) {
        const score = scores[i] ?? 0;
        if (side === "lo" ? score > loCut : score < hiCut) continue;
        const perpScore = (proj[i]?.a ?? 0) * perpVec.x + (proj[i]?.b ?? 0) * perpVec.y;
        sum += perpScore;
        sum2 += perpScore * perpScore;
        n2 += 1;
      }
      if (n2 < 2) return 0;
      const avg = sum / n2;
      return sum2 / n2 - avg * avg;
    };
    const loSpread = spread("lo");
    const hiSpread = spread("hi");
    return { loSpread, hiSpread, contrast: Math.abs(hiSpread - loSpread) };
  };
  const minorRes = evalAxis(minor, major);
  const majorRes = evalAxis(major, minor);
  const useMinor = minorRes.contrast >= majorRes.contrast;
  const chosenRes = useMinor ? minorRes : majorRes;
  const chosenAxis = useMinor ? minor : major;
  const chosenAxis3 = new Vector3().addScaledVector(axisA, chosenAxis.x).addScaledVector(axisB, chosenAxis.y).normalize();
  return chosenRes.hiSpread < chosenRes.loSpread ? chosenAxis3 : chosenAxis3.negate();
}
function archPlanAxes(points) {
  if (points.length < 30) return null;
  const mean = meanVec(points);
  const up = smallestPcaAxis(points, mean);
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();
  return { up, anterior: anteriorAxis(points, mean, up), center: mean };
}
function smallestPcaAxis(points, mean) {
  let xx = 0;
  let yy = 0;
  let zz = 0;
  let xy = 0;
  let xz = 0;
  let yz = 0;
  for (const p of points) {
    const x = p[0] - mean.x;
    const y = p[1] - mean.y;
    const z = p[2] - mean.z;
    xx += x * x;
    yy += y * y;
    zz += z * z;
    xy += x * y;
    xz += x * z;
    yz += y * z;
  }
  const axes = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1)
  ];
  const vars = [xx, yy, zz];
  let best = 0;
  if ((vars[1] ?? 0) < (vars[best] ?? 0)) best = 1;
  if ((vars[2] ?? 0) < (vars[best] ?? 0)) best = 2;
  const axis = axes[best] ?? new Vector3(0, 0, 1);
  if (xy * xy + xz * xz + yz * yz > 1) {
    const candidates = [
      new Vector3(yy + zz, -xy, -xz),
      new Vector3(-xy, xx + zz, -yz),
      new Vector3(-xz, -yz, xx + yy)
    ];
    let pick = candidates[0];
    let score = Infinity;
    for (const c2 of candidates) {
      if (c2.lengthSq() < 1e-8) continue;
      const v = xx * c2.x * c2.x + yy * c2.y * c2.y + zz * c2.z * c2.z + 2 * xy * c2.x * c2.y + 2 * xz * c2.x * c2.z + 2 * yz * c2.y * c2.z;
      if (v < score) {
        score = v;
        pick = c2;
      }
    }
    if (pick.lengthSq() > 1e-8) return pick.normalize();
  }
  return axis;
}
function reseatOcclusalOrigin(loaded, frame) {
  const upperPts = [];
  const lowerPts = [];
  const archPts = [];
  for (const entry of loaded) {
    if (entry.role !== "upper" && entry.role !== "lower") continue;
    const pts = samplePositions(entry.geometry, 1800);
    archPts.push(...pts);
    if (entry.role === "upper") upperPts.push(...pts);
    else lowerPts.push(...pts);
  }
  const mean = meanVec(archPts);
  if (!mean) return;
  const upperC = meanVec(upperPts);
  const lowerC = meanVec(lowerPts);
  const mid = upperC && lowerC ? upperC.clone().add(lowerC).multiplyScalar(0.5) : mean;
  const up = frame.up.clone().normalize();
  const shift = (mean.x - mid.x) * up.x + (mean.y - mid.y) * up.y + (mean.z - mid.z) * up.z;
  const origin = new Vector3(
    mean.x - up.x * shift,
    mean.y - up.y * shift,
    mean.z - up.z * shift
  );
  const { right, anterior } = frame;
  if (Math.abs(right.dot(anterior)) > 0.02 || Math.abs(right.dot(up)) > 0.02 || Math.abs(anterior.dot(up)) > 0.02 || Math.abs(right.length() - 1) > 0.02 || Math.abs(anterior.length() - 1) > 0.02 || Math.abs(up.length() - 1) > 0.02) {
    return;
  }
  const matrix = new Matrix4().set(
    right.x,
    right.y,
    right.z,
    -right.dot(origin),
    anterior.x,
    anterior.y,
    anterior.z,
    -anterior.dot(origin),
    up.x,
    up.y,
    up.z,
    -up.dot(origin),
    0,
    0,
    0,
    1
  );
  for (const entry of loaded) {
    entry.geometry.applyMatrix4(matrix);
    entry.geometry.computeBoundingBox();
  }
}
const FIT_GRID_MM = 2.4;
function mmToUnits(mm, unitToMm) {
  return mm / (unitToMm > 0 ? unitToMm : 1);
}
function yieldFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}
class BiteAlignCancelled extends Error {
  constructor() {
    super("bite-align-cancelled");
    this.name = "BiteAlignCancelled";
  }
}
let nextYieldAt = 0;
function resetYieldClock() {
  nextYieldAt = 0;
}
async function pause(options) {
  if (options?.cancelled?.()) throw new BiteAlignCancelled();
  await yieldFrame();
  nextYieldAt = performance.now() + 48;
  if (options?.cancelled?.()) throw new BiteAlignCancelled();
}
function checkpoint(options) {
  if (options?.cancelled?.()) throw new BiteAlignCancelled();
  if (performance.now() < nextYieldAt) return;
  return pause(options);
}
function cloudRadius(cloud) {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const n2 = cloud.count;
  if (n2 === 0) return 0;
  for (let i = 0; i < n2; i += 1) {
    cx += cloud.xyz[i * 3] ?? 0;
    cy += cloud.xyz[i * 3 + 1] ?? 0;
    cz += cloud.xyz[i * 3 + 2] ?? 0;
  }
  cx /= n2;
  cy /= n2;
  cz /= n2;
  let max = 0;
  for (let i = 0; i < n2; i += 1) {
    const d2 = Math.hypot(
      (cloud.xyz[i * 3] ?? 0) - cx,
      (cloud.xyz[i * 3 + 1] ?? 0) - cy,
      (cloud.xyz[i * 3 + 2] ?? 0) - cz
    );
    if (d2 > max) max = d2;
  }
  return max;
}
function sampleGeometry(geometry, voxel, cap) {
  const pos = geometry.getAttribute("position");
  const nrm = geometry.getAttribute("normal");
  const empty = { xyz: new Float32Array(0), nrm: new Float32Array(0), count: 0 };
  if (!pos || pos.count === 0) return empty;
  const stride = Math.max(1, Math.ceil(pos.count / Math.max(cap, 1)));
  const cell = Math.max(voxel, 1e-6);
  const seen = /* @__PURE__ */ new Map();
  const xyz = [];
  const normals = [];
  for (let i = 0; i < pos.count; i += stride) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ix = Math.floor(x / cell);
    const iy = Math.floor(y / cell);
    const iz = Math.floor(z / cell);
    const key = ix + 4096 + (iy + 4096) * 8192 + (iz + 4096) * 8192 * 8192;
    if (seen.has(key)) continue;
    let nx = 0;
    let ny = 0;
    let nz = 1;
    if (nrm && nrm.count === pos.count) {
      nx = nrm.getX(i);
      ny = nrm.getY(i);
      nz = nrm.getZ(i);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) continue;
    seen.set(key, xyz.length / 3);
    xyz.push(x, y, z);
    normals.push(nx / len, ny / len, nz / len);
  }
  return {
    xyz: Float32Array.from(xyz),
    nrm: Float32Array.from(normals),
    count: xyz.length / 3
  };
}
function cloneCloud(cloud) {
  return {
    xyz: new Float32Array(cloud.xyz),
    nrm: new Float32Array(cloud.nrm),
    count: cloud.count
  };
}
function cellKey(ix, iy, iz) {
  return ix + 4096 + (iy + 4096) * 8192 + (iz + 4096) * 8192 * 8192;
}
function buildGrid(cloud, cell) {
  const size = Math.max(cell, 1e-6);
  const buckets = /* @__PURE__ */ new Map();
  for (let i = 0; i < cloud.count; i += 1) {
    const ix = Math.floor((cloud.xyz[i * 3] ?? 0) / size);
    const iy = Math.floor((cloud.xyz[i * 3 + 1] ?? 0) / size);
    const iz = Math.floor((cloud.xyz[i * 3 + 2] ?? 0) / size);
    const key = cellKey(ix, iy, iz);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }
  const visit = (x, y, z, maxDist, onPoint, stopAfterRing) => {
    const ix = Math.floor(x / size);
    const iy = Math.floor(y / size);
    const iz = Math.floor(z / size);
    const maxRing = Math.max(1, Math.ceil(maxDist / size));
    for (let ring = 0; ring <= maxRing; ring += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          for (let dx = -ring; dx <= ring; dx += 1) {
            if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring) {
              continue;
            }
            const bucket = buckets.get(cellKey(ix + dx, iy + dy, iz + dz));
            if (!bucket) continue;
            for (const index2 of bucket) {
              const ox = (cloud.xyz[index2 * 3] ?? 0) - x;
              const oy = (cloud.xyz[index2 * 3 + 1] ?? 0) - y;
              const oz = (cloud.xyz[index2 * 3 + 2] ?? 0) - z;
              onPoint(index2, ox * ox + oy * oy + oz * oz);
            }
          }
        }
      }
      if (stopAfterRing?.(ring)) return;
    }
  };
  const nearest = (x, y, z, maxDist) => {
    let best = -1;
    let bestD = maxDist * maxDist;
    visit(
      x,
      y,
      z,
      maxDist,
      (index2, dist2) => {
        if (dist2 < bestD) {
          bestD = dist2;
          best = index2;
        }
      },
      (ring) => best >= 0 && bestD <= ring * ring * size * size
    );
    return best;
  };
  const around = (x, y, z, radius, limit) => {
    const found = [];
    visit(x, y, z, radius, (index2, dist2) => {
      if (dist2 > 1e-10 && dist2 <= radius * radius) found.push({ index: index2, dist2 });
    });
    found.sort((a2, b2) => a2.dist2 - b2.dist2);
    return found.slice(0, limit).map((row) => row.index);
  };
  const band = (x, y, z, minDist, maxDist, limit) => {
    const inner = [];
    const outer = [];
    const mid2 = ((minDist + maxDist) * 0.5) ** 2;
    const min2 = minDist * minDist;
    const max2 = maxDist * maxDist;
    visit(x, y, z, maxDist, (index2, dist2) => {
      if (dist2 < min2 || dist2 > max2) return;
      if (dist2 <= mid2) {
        if (inner.length < limit) inner.push(index2);
      } else if (outer.length < limit) outer.push(index2);
    });
    const mixed = [];
    const span = Math.max(inner.length, outer.length);
    for (let i = 0; i < span && mixed.length < limit; i += 1) {
      const near = inner[i];
      const far = outer[i];
      if (near != null) mixed.push(near);
      if (mixed.length >= limit) break;
      if (far != null) mixed.push(far);
    }
    return mixed;
  };
  return { nearest, around, band };
}
function mul33(a2, b2) {
  const out2 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  for (let r2 = 0; r2 < 3; r2 += 1) {
    for (let c2 = 0; c2 < 3; c2 += 1) {
      out2[r2][c2] = (a2[r2]?.[0] ?? 0) * (b2[0]?.[c2] ?? 0) + (a2[r2]?.[1] ?? 0) * (b2[1]?.[c2] ?? 0) + (a2[r2]?.[2] ?? 0) * (b2[2]?.[c2] ?? 0);
    }
  }
  return out2;
}
function transpose33(a2) {
  return [
    [a2[0]?.[0] ?? 0, a2[1]?.[0] ?? 0, a2[2]?.[0] ?? 0],
    [a2[0]?.[1] ?? 0, a2[1]?.[1] ?? 0, a2[2]?.[1] ?? 0],
    [a2[0]?.[2] ?? 0, a2[1]?.[2] ?? 0, a2[2]?.[2] ?? 0]
  ];
}
function det33(a2) {
  const a00 = a2[0]?.[0] ?? 0;
  const a01 = a2[0]?.[1] ?? 0;
  const a02 = a2[0]?.[2] ?? 0;
  const a10 = a2[1]?.[0] ?? 0;
  const a11 = a2[1]?.[1] ?? 0;
  const a12 = a2[1]?.[2] ?? 0;
  const a20 = a2[2]?.[0] ?? 0;
  const a21 = a2[2]?.[1] ?? 0;
  const a22 = a2[2]?.[2] ?? 0;
  return a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20);
}
function column3(m, col) {
  return [m[0]?.[col] ?? 0, m[1]?.[col] ?? 0, m[2]?.[col] ?? 0];
}
function writeColumn3(m, col, v) {
  if (m[0]) m[0][col] = v[0] ?? 0;
  if (m[1]) m[1][col] = v[1] ?? 0;
  if (m[2]) m[2][col] = v[2] ?? 0;
}
function len3(v) {
  return Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
}
function dot3(a2, b2) {
  return (a2[0] ?? 0) * (b2[0] ?? 0) + (a2[1] ?? 0) * (b2[1] ?? 0) + (a2[2] ?? 0) * (b2[2] ?? 0);
}
function cross3(a2, b2) {
  return [
    (a2[1] ?? 0) * (b2[2] ?? 0) - (a2[2] ?? 0) * (b2[1] ?? 0),
    (a2[2] ?? 0) * (b2[0] ?? 0) - (a2[0] ?? 0) * (b2[2] ?? 0),
    (a2[0] ?? 0) * (b2[1] ?? 0) - (a2[1] ?? 0) * (b2[0] ?? 0)
  ];
}
function completeWeakColumn(m) {
  const cols = [0, 1, 2].map((col) => column3(m, col));
  const lengths = cols.map(len3);
  const strong = [0, 1, 2].filter((index2) => (lengths[index2] ?? 0) > 0.5);
  const weak = [0, 1, 2].filter((index2) => (lengths[index2] ?? 0) <= 0.5);
  if (strong.length < 2) return null;
  const i = strong[0] ?? 0;
  const j = strong[1] ?? 1;
  const a2 = (cols[i] ?? [1, 0, 0]).map((value) => value / (lengths[i] || 1));
  const bRaw = (cols[j] ?? [0, 1, 0]).map((value) => value / (lengths[j] || 1));
  const along = dot3(a2, bRaw);
  let b2 = [bRaw[0] - a2[0] * along, bRaw[1] - a2[1] * along, bRaw[2] - a2[2] * along];
  const bLen = len3(b2);
  if (bLen < 1e-6) return null;
  b2 = b2.map((value) => value / bLen);
  const c2 = cross3(a2, b2);
  if (len3(c2) < 1e-8) return null;
  writeColumn3(m, i, a2);
  writeColumn3(m, j, b2);
  const k = weak[0] ?? strong[2] ?? 2;
  writeColumn3(m, k, c2);
  return k;
}
function jacobiEigen3(source) {
  const m = source.map((row) => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
  for (let sweep = 0; sweep < 16; sweep += 1) {
    let p = 0;
    let q = 1;
    let max = Math.abs(m[0]?.[1] ?? 0);
    if (Math.abs(m[0]?.[2] ?? 0) > max) {
      max = Math.abs(m[0]?.[2] ?? 0);
      p = 0;
      q = 2;
    }
    if (Math.abs(m[1]?.[2] ?? 0) > max) {
      max = Math.abs(m[1]?.[2] ?? 0);
      p = 1;
      q = 2;
    }
    if (max < 1e-12) break;
    const app = m[p]?.[p] ?? 0;
    const aqq = m[q]?.[q] ?? 0;
    const apq = m[p]?.[q] ?? 0;
    if (Math.abs(apq) < 1e-15) break;
    const tau = (aqq - app) / (2 * apq);
    const tt = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c2 = 1 / Math.sqrt(1 + tt * tt);
    const s2 = tt * c2;
    for (let k = 0; k < 3; k += 1) {
      if (k === p || k === q) continue;
      const aik = m[k]?.[p] ?? 0;
      const akq = m[k]?.[q] ?? 0;
      const nip = c2 * aik - s2 * akq;
      const niq = s2 * aik + c2 * akq;
      if (m[k]) {
        m[k][p] = nip;
        m[k][q] = niq;
      }
      if (m[p]) m[p][k] = nip;
      if (m[q]) m[q][k] = niq;
    }
    if (m[p]) m[p][p] = c2 * c2 * app - 2 * s2 * c2 * apq + s2 * s2 * aqq;
    if (m[q]) m[q][q] = s2 * s2 * app + 2 * s2 * c2 * apq + c2 * c2 * aqq;
    if (m[p]) m[p][q] = 0;
    if (m[q]) m[q][p] = 0;
    for (let k = 0; k < 3; k += 1) {
      const vip = v[k]?.[p] ?? 0;
      const viq = v[k]?.[q] ?? 0;
      if (!v[k]) continue;
      v[k][p] = c2 * vip - s2 * viq;
      v[k][q] = s2 * vip + c2 * viq;
    }
  }
  return {
    values: [m[0]?.[0] ?? 0, m[1]?.[1] ?? 0, m[2]?.[2] ?? 0],
    vectors: v
  };
}
function kabsch(src, dst, pairs) {
  if (pairs.length < 3) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  for (const pair of pairs) {
    sx += src[pair.s * 3] ?? 0;
    sy += src[pair.s * 3 + 1] ?? 0;
    sz += src[pair.s * 3 + 2] ?? 0;
    dx += dst[pair.d * 3] ?? 0;
    dy += dst[pair.d * 3 + 1] ?? 0;
    dz += dst[pair.d * 3 + 2] ?? 0;
  }
  const n2 = pairs.length;
  sx /= n2;
  sy /= n2;
  sz /= n2;
  dx /= n2;
  dy /= n2;
  dz /= n2;
  const h2 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  for (const pair of pairs) {
    const px = (src[pair.s * 3] ?? 0) - sx;
    const py = (src[pair.s * 3 + 1] ?? 0) - sy;
    const pz = (src[pair.s * 3 + 2] ?? 0) - sz;
    const qx = (dst[pair.d * 3] ?? 0) - dx;
    const qy = (dst[pair.d * 3 + 1] ?? 0) - dy;
    const qz = (dst[pair.d * 3 + 2] ?? 0) - dz;
    h2[0][0] += px * qx;
    h2[0][1] += px * qy;
    h2[0][2] += px * qz;
    h2[1][0] += py * qx;
    h2[1][1] += py * qy;
    h2[1][2] += py * qz;
    h2[2][0] += pz * qx;
    h2[2][1] += pz * qy;
    h2[2][2] += pz * qz;
  }
  const cov = mul33(transpose33(h2), h2);
  const eigen = jacobiEigen3(cov);
  const order = [0, 1, 2].sort(
    (a2, b2) => (eigen.values[b2] ?? 0) - (eigen.values[a2] ?? 0)
  );
  const vMat = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const uMat = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const sigmas = [0, 1, 2].map((col) => {
    const srcCol = order[col] ?? col;
    return Math.sqrt(Math.max(eigen.values[srcCol] ?? 0, 0));
  });
  const sigmaMax = Math.max(sigmas[0] ?? 0, sigmas[1] ?? 0, sigmas[2] ?? 0);
  const sigmaFloor = Math.max(sigmaMax * 1e-4, 1e-8);
  for (let col = 0; col < 3; col += 1) {
    const srcCol = order[col] ?? col;
    const sigma = sigmas[col] ?? 0;
    for (let row = 0; row < 3; row += 1) {
      vMat[row][col] = eigen.vectors[row]?.[srcCol] ?? (row === srcCol ? 1 : 0);
    }
    if (sigma <= sigmaFloor) continue;
    for (let row = 0; row < 3; row += 1) {
      uMat[row][col] = ((h2[row]?.[0] ?? 0) * (vMat[0]?.[col] ?? 0) + (h2[row]?.[1] ?? 0) * (vMat[1]?.[col] ?? 0) + (h2[row]?.[2] ?? 0) * (vMat[2]?.[col] ?? 0)) / sigma;
    }
    const colLen = Math.hypot(uMat[0]?.[col] ?? 0, uMat[1]?.[col] ?? 0, uMat[2]?.[col] ?? 0);
    if (colLen < 1e-8) {
      if (uMat[0]) uMat[0][col] = 0;
      if (uMat[1]) uMat[1][col] = 0;
      if (uMat[2]) uMat[2][col] = 0;
      continue;
    }
    for (let row = 0; row < 3; row += 1) {
      if (uMat[row]) uMat[row][col] = (uMat[row][col] ?? 0) / colLen;
    }
  }
  const weakCol = completeWeakColumn(uMat);
  if (weakCol == null) return null;
  let r2 = mul33(vMat, transpose33(uMat));
  if (det33(r2) < 0) {
    writeColumn3(uMat, weakCol, column3(uMat, weakCol).map((value) => -value));
    r2 = mul33(vMat, transpose33(uMat));
  }
  const t0 = dx - ((r2[0]?.[0] ?? 0) * sx + (r2[0]?.[1] ?? 0) * sy + (r2[0]?.[2] ?? 0) * sz);
  const t1 = dy - ((r2[1]?.[0] ?? 0) * sx + (r2[1]?.[1] ?? 0) * sy + (r2[1]?.[2] ?? 0) * sz);
  const t2 = dz - ((r2[2]?.[0] ?? 0) * sx + (r2[2]?.[1] ?? 0) * sy + (r2[2]?.[2] ?? 0) * sz);
  return { r: r2, t: [t0, t1, t2] };
}
function applyRigid(cloud, rigid) {
  const r2 = rigid.r;
  for (let i = 0; i < cloud.count; i += 1) {
    const x = cloud.xyz[i * 3] ?? 0;
    const y = cloud.xyz[i * 3 + 1] ?? 0;
    const z = cloud.xyz[i * 3 + 2] ?? 0;
    cloud.xyz[i * 3] = (r2[0]?.[0] ?? 1) * x + (r2[0]?.[1] ?? 0) * y + (r2[0]?.[2] ?? 0) * z + rigid.t[0];
    cloud.xyz[i * 3 + 1] = (r2[1]?.[0] ?? 0) * x + (r2[1]?.[1] ?? 1) * y + (r2[1]?.[2] ?? 0) * z + rigid.t[1];
    cloud.xyz[i * 3 + 2] = (r2[2]?.[0] ?? 0) * x + (r2[2]?.[1] ?? 0) * y + (r2[2]?.[2] ?? 1) * z + rigid.t[2];
    const nx = cloud.nrm[i * 3] ?? 0;
    const ny = cloud.nrm[i * 3 + 1] ?? 0;
    const nz = cloud.nrm[i * 3 + 2] ?? 0;
    const nnx = (r2[0]?.[0] ?? 1) * nx + (r2[0]?.[1] ?? 0) * ny + (r2[0]?.[2] ?? 0) * nz;
    const nny = (r2[1]?.[0] ?? 0) * nx + (r2[1]?.[1] ?? 1) * ny + (r2[1]?.[2] ?? 0) * nz;
    const nnz = (r2[2]?.[0] ?? 0) * nx + (r2[2]?.[1] ?? 0) * ny + (r2[2]?.[2] ?? 1) * nz;
    const len = Math.hypot(nnx, nny, nnz) || 1;
    cloud.nrm[i * 3] = nnx / len;
    cloud.nrm[i * 3 + 1] = nny / len;
    cloud.nrm[i * 3 + 2] = nnz / len;
  }
}
function compose(base, rigid) {
  const delta = new Matrix4().set(
    rigid.r[0]?.[0] ?? 1,
    rigid.r[0]?.[1] ?? 0,
    rigid.r[0]?.[2] ?? 0,
    rigid.t[0],
    rigid.r[1]?.[0] ?? 0,
    rigid.r[1]?.[1] ?? 1,
    rigid.r[1]?.[2] ?? 0,
    rigid.t[1],
    rigid.r[2]?.[0] ?? 0,
    rigid.r[2]?.[1] ?? 0,
    rigid.r[2]?.[2] ?? 1,
    rigid.t[2],
    0,
    0,
    0,
    1
  );
  base.premultiply(delta);
}
function solve6(a2, b2) {
  const m = a2.map((row, i) => [...row, b2[i] ?? 0]);
  for (let col = 0; col < 6; col += 1) {
    let pivot = col;
    let best = Math.abs(m[col]?.[col] ?? 0);
    for (let row = col + 1; row < 6; row += 1) {
      const value = Math.abs(m[row]?.[col] ?? 0);
      if (value > best) {
        best = value;
        pivot = row;
      }
    }
    if (best < 1e-12) return null;
    if (pivot !== col) {
      const swap = m[col];
      m[col] = m[pivot] ?? [];
      m[pivot] = swap ?? [];
    }
    const div = m[col]?.[col] ?? 1;
    for (let k = col; k < 7; k += 1) {
      if (m[col]) m[col][k] = (m[col][k] ?? 0) / div;
    }
    for (let row = 0; row < 6; row += 1) {
      if (row === col) continue;
      const factor = m[row]?.[col] ?? 0;
      for (let k = col; k < 7; k += 1) {
        if (m[row]) m[row][k] = (m[row][k] ?? 0) - factor * (m[col]?.[k] ?? 0);
      }
    }
  }
  return [0, 1, 2, 3, 4, 5].map((i) => m[i]?.[6] ?? 0);
}
function rodrigues(rx, ry, rz) {
  const theta = Math.hypot(rx, ry, rz);
  if (theta < 1e-12) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
  }
  const x = rx / theta;
  const y = ry / theta;
  const z = rz / theta;
  const c2 = Math.cos(theta);
  const s2 = Math.sin(theta);
  const cc = 1 - c2;
  return [
    [c2 + x * x * cc, x * y * cc - z * s2, x * z * cc + y * s2],
    [y * x * cc + z * s2, c2 + y * y * cc, y * z * cc - x * s2],
    [z * x * cc - y * s2, z * y * cc + x * s2, c2 + z * z * cc]
  ];
}
function pointToPlane(src, dstXyz, dstNrm, pairs) {
  const ata = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0));
  const atb = [0, 0, 0, 0, 0, 0];
  for (const pair of pairs) {
    const px = src[pair.s * 3] ?? 0;
    const py = src[pair.s * 3 + 1] ?? 0;
    const pz = src[pair.s * 3 + 2] ?? 0;
    const qx = dstXyz[pair.d * 3] ?? 0;
    const qy = dstXyz[pair.d * 3 + 1] ?? 0;
    const qz = dstXyz[pair.d * 3 + 2] ?? 0;
    let nx = dstNrm[pair.d * 3] ?? 0;
    let ny = dstNrm[pair.d * 3 + 1] ?? 0;
    let nz = dstNrm[pair.d * 3 + 2] ?? 0;
    const nlen = Math.hypot(nx, ny, nz);
    if (nlen < 1e-8) continue;
    nx /= nlen;
    ny /= nlen;
    nz /= nlen;
    const row = [
      py * nz - pz * ny,
      pz * nx - px * nz,
      px * ny - py * nx,
      nx,
      ny,
      nz
    ];
    const rhs = (qx - px) * nx + (qy - py) * ny + (qz - pz) * nz;
    for (let r2 = 0; r2 < 6; r2 += 1) {
      atb[r2] = (atb[r2] ?? 0) + (row[r2] ?? 0) * rhs;
      for (let c2 = 0; c2 < 6; c2 += 1) {
        const line = ata[r2];
        if (line) line[c2] = (line[c2] ?? 0) + (row[r2] ?? 0) * (row[c2] ?? 0);
      }
    }
  }
  for (let i = 0; i < 6; i += 1) {
    const line = ata[i];
    if (line) line[i] = (line[i] ?? 0) + 1e-6;
  }
  const solved = solve6(ata, atb);
  if (!solved) return null;
  let rx = solved[0] ?? 0;
  let ry = solved[1] ?? 0;
  let rz = solved[2] ?? 0;
  let tx = solved[3] ?? 0;
  let ty = solved[4] ?? 0;
  let tz = solved[5] ?? 0;
  const angle = Math.hypot(rx, ry, rz);
  if (angle > 0.18) {
    const scale = 0.18 / angle;
    rx *= scale;
    ry *= scale;
    rz *= scale;
    tx *= scale;
    ty *= scale;
    tz *= scale;
  }
  return { r: rodrigues(rx, ry, rz), t: [tx, ty, tz] };
}
function overlapFitness(source, target, grid, unitToMm) {
  const limit = mmToUnits(14, unitToMm);
  const tight = mmToUnits(0.45, unitToMm);
  const wide = mmToUnits(6, unitToMm);
  const dists = [];
  let inliers = 0;
  let inlierSum = 0;
  for (let i = 0; i < source.count; i += 1) {
    const hit = grid.nearest(
      source.xyz[i * 3] ?? 0,
      source.xyz[i * 3 + 1] ?? 0,
      source.xyz[i * 3 + 2] ?? 0,
      limit
    );
    if (hit < 0) {
      dists.push(limit);
      continue;
    }
    const d2 = Math.hypot(
      (source.xyz[i * 3] ?? 0) - (target.xyz[hit * 3] ?? 0),
      (source.xyz[i * 3 + 1] ?? 0) - (target.xyz[hit * 3 + 1] ?? 0),
      (source.xyz[i * 3 + 2] ?? 0) - (target.xyz[hit * 3 + 2] ?? 0)
    );
    dists.push(d2);
    if (d2 <= tight) {
      inliers += 1;
      inlierSum += d2;
    }
  }
  if (dists.length === 0) return { mean: limit, inliers: 0, coverage: 0, sideMean: limit };
  const sourceGrid = buildGrid(source, mmToUnits(2, unitToMm));
  let covered = 0;
  const step = Math.max(1, Math.floor(target.count / 500));
  const targetDists = [];
  for (let i = 0; i < target.count; i += step) {
    const hit = sourceGrid.nearest(
      target.xyz[i * 3] ?? 0,
      target.xyz[i * 3 + 1] ?? 0,
      target.xyz[i * 3 + 2] ?? 0,
      wide
    );
    if (hit < 0) {
      targetDists.push(wide);
      continue;
    }
    const d2 = Math.hypot(
      (target.xyz[i * 3] ?? 0) - (source.xyz[hit * 3] ?? 0),
      (target.xyz[i * 3 + 1] ?? 0) - (source.xyz[hit * 3 + 1] ?? 0),
      (target.xyz[i * 3 + 2] ?? 0) - (source.xyz[hit * 3 + 2] ?? 0)
    );
    targetDists.push(Math.min(d2, wide));
    if (d2 <= tight) covered += 1;
  }
  const seen = targetDists.length;
  const coverage = seen > 0 ? covered / seen : 0;
  targetDists.sort((a2, b2) => a2 - b2);
  const sideN = Math.max(12, Math.floor(seen * 0.4));
  let sideSum = 0;
  for (let i = 0; i < sideN; i += 1) sideSum += targetDists[i] ?? wide;
  const sideMean = sideN > 0 ? sideSum / sideN : wide;
  if (inliers >= 20) return { mean: inlierSum / inliers, inliers, coverage, sideMean };
  dists.sort((a2, b2) => a2 - b2);
  const keep = Math.max(24, Math.floor(dists.length * 0.08));
  let sum = 0;
  for (let i = 0; i < keep; i += 1) sum += dists[i] ?? 0;
  return { mean: sum / keep, inliers, coverage, sideMean };
}
function orientNormals(source, target, grid, unitToMm) {
  const limit = mmToUnits(8, unitToMm);
  const dots = [];
  const step = Math.max(1, Math.floor(source.count / 250));
  for (let i = 0; i < source.count; i += step) {
    const hit = grid.nearest(
      source.xyz[i * 3] ?? 0,
      source.xyz[i * 3 + 1] ?? 0,
      source.xyz[i * 3 + 2] ?? 0,
      limit
    );
    if (hit < 0) continue;
    dots.push(
      (source.nrm[i * 3] ?? 0) * (target.nrm[hit * 3] ?? 0) + (source.nrm[i * 3 + 1] ?? 0) * (target.nrm[hit * 3 + 1] ?? 0) + (source.nrm[i * 3 + 2] ?? 0) * (target.nrm[hit * 3 + 2] ?? 0)
    );
  }
  if (dots.length < 12) return;
  dots.sort((a2, b2) => a2 - b2);
  if ((dots[Math.floor(dots.length / 2)] ?? 0) >= 0) return;
  for (let i = 0; i < source.count; i += 1) {
    source.nrm[i * 3] = -(source.nrm[i * 3] ?? 0);
    source.nrm[i * 3 + 1] = -(source.nrm[i * 3 + 1] ?? 0);
    source.nrm[i * 3 + 2] = -(source.nrm[i * 3 + 2] ?? 0);
  }
}
function collectPairs(source, target, grid, gate, normalMin, keepFraction) {
  const found = [];
  for (let i = 0; i < source.count; i += 1) {
    const hit = grid.nearest(
      source.xyz[i * 3] ?? 0,
      source.xyz[i * 3 + 1] ?? 0,
      source.xyz[i * 3 + 2] ?? 0,
      gate
    );
    if (hit < 0) continue;
    const dx = (source.xyz[i * 3] ?? 0) - (target.xyz[hit * 3] ?? 0);
    const dy = (source.xyz[i * 3 + 1] ?? 0) - (target.xyz[hit * 3 + 1] ?? 0);
    const dz = (source.xyz[i * 3 + 2] ?? 0) - (target.xyz[hit * 3 + 2] ?? 0);
    const dist = Math.hypot(dx, dy, dz);
    if (dist > gate) continue;
    const dot = (source.nrm[i * 3] ?? 0) * (target.nrm[hit * 3] ?? 0) + (source.nrm[i * 3 + 1] ?? 0) * (target.nrm[hit * 3 + 1] ?? 0) + (source.nrm[i * 3 + 2] ?? 0) * (target.nrm[hit * 3 + 2] ?? 0);
    if (dot < normalMin) continue;
    found.push({ s: i, d: hit, dist });
  }
  found.sort((a2, b2) => a2.dist - b2.dist);
  const keep = Math.min(
    found.length,
    Math.max(40, Math.floor(source.count * keepFraction))
  );
  return found.slice(0, keep);
}
async function refineToTarget(source, target, unitToMm, tightStart = false, options, report) {
  const total = new Matrix4();
  const cell = mmToUnits(FIT_GRID_MM, unitToMm);
  const grid = buildGrid(target, cell);
  orientNormals(source, target, grid, unitToMm);
  const gates = tightStart === "screen" ? [8, 5, 3.2, 2, 1.3] : tightStart ? [4.5, 3, 2, 1.3, 0.8, 0.5] : [12, 8, 5, 3.5, 2.4, 1.6, 1.1, 0.75, 0.55];
  for (let iter = 0; iter < gates.length; iter += 1) {
    const gap = checkpoint(options);
    if (gap) await gap;
    const gate = mmToUnits(gates[iter] ?? 1, unitToMm);
    const pairs = collectPairs(source, target, grid, gate, iter < 4 ? 0.15 : 0.45, 0.22);
    if (pairs.length < 30) break;
    const fine = (gates[iter] ?? 1) <= 1.6;
    const rigid = fine ? pointToPlane(source.xyz, target.xyz, target.nrm, pairs) : kabsch(source.xyz, target.xyz, pairs);
    if (!rigid) break;
    const move = Math.hypot(rigid.t[0], rigid.t[1], rigid.t[2]);
    if (move > gate) continue;
    if (move > mmToUnits(18, unitToMm)) continue;
    applyRigid(source, rigid);
    compose(total, rigid);
    report?.(total);
  }
  return total;
}
const PPF_ANGLE_BINS = 15;
const PPF_ALPHA_BINS = 30;
function clampUnit(value) {
  return Math.max(-1, Math.min(1, value));
}
function rotationToX(nx, ny, nz) {
  const vy = nz;
  const vz = -ny;
  const s2 = vy * vy + vz * vz;
  const c2 = nx;
  if (s2 < 1e-12) {
    if (c2 > 0) {
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ];
    }
    return [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1]
    ];
  }
  const k = (1 - c2) / s2;
  const skew = [
    [0, -vz, vy],
    [vz, 0, 0],
    [-vy, 0, 0]
  ];
  const out2 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const ident = row === col ? 1 : 0;
      const vx = row === 0 ? 0 : row === 1 ? vy : vz;
      const ux = col === 0 ? 0 : col === 1 ? vy : vz;
      out2[row][col] = ident + (skew[row]?.[col] ?? 0) + k * (vx * ux - (row === col ? s2 : 0));
    }
  }
  return out2;
}
function rotationX(alpha) {
  const c2 = Math.cos(alpha);
  const s2 = Math.sin(alpha);
  return [
    [1, 0, 0],
    [0, c2, -s2],
    [0, s2, c2]
  ];
}
function pairAlpha(rot, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const y = (rot[1]?.[0] ?? 0) * dx + (rot[1]?.[1] ?? 1) * dy + (rot[1]?.[2] ?? 0) * dz;
  const z = (rot[2]?.[0] ?? 0) * dx + (rot[2]?.[1] ?? 0) * dy + (rot[2]?.[2] ?? 1) * dz;
  return Math.atan2(z, y);
}
function strideIds(count, cap) {
  const stride = Math.max(1, Math.ceil(count / Math.max(cap, 1)));
  const ids = [];
  for (let i = 0; i < count; i += stride) ids.push(i);
  return ids;
}
function pointPair(cloud, i, j) {
  const ax = cloud.xyz[i * 3] ?? 0;
  const ay = cloud.xyz[i * 3 + 1] ?? 0;
  const az = cloud.xyz[i * 3 + 2] ?? 0;
  const bx = cloud.xyz[j * 3] ?? 0;
  const by = cloud.xyz[j * 3 + 1] ?? 0;
  const bz = cloud.xyz[j * 3 + 2] ?? 0;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-8) return null;
  const inv = 1 / dist;
  const ux = dx * inv;
  const uy = dy * inv;
  const uz = dz * inv;
  const nix = cloud.nrm[i * 3] ?? 0;
  const niy = cloud.nrm[i * 3 + 1] ?? 0;
  const niz = cloud.nrm[i * 3 + 2] ?? 0;
  const njx = cloud.nrm[j * 3] ?? 0;
  const njy = cloud.nrm[j * 3 + 1] ?? 0;
  const njz = cloud.nrm[j * 3 + 2] ?? 0;
  return {
    dist,
    a1: Math.acos(clampUnit(nix * ux + niy * uy + niz * uz)),
    a2: Math.acos(clampUnit(njx * ux + njy * uy + njz * uz)),
    a3: Math.acos(clampUnit(nix * njx + niy * njy + niz * njz))
  };
}
function angleBin(angle) {
  let bin = Math.floor(angle / Math.PI * PPF_ANGLE_BINS);
  if (bin < 0) bin = 0;
  if (bin >= PPF_ANGLE_BINS) bin = PPF_ANGLE_BINS - 1;
  return bin;
}
function featureKey(dist, a1, a2, a3, distStep) {
  const d2 = Math.max(0, Math.round(dist / distStep));
  const bins = PPF_ANGLE_BINS;
  return ((d2 * bins + angleBin(a1)) * bins + angleBin(a2)) * bins + angleBin(a3);
}
function flipCloudNormals(cloud) {
  const nrm = new Float32Array(cloud.nrm.length);
  for (let i = 0; i < nrm.length; i += 1) nrm[i] = -(cloud.nrm[i] ?? 0);
  return { xyz: cloud.xyz, nrm, count: cloud.count };
}
async function buildPpfHash(model, ids, minD, maxD, distStep, options) {
  const grid = buildGrid(model, Math.max(maxD / 5, 1e-4));
  const hash = /* @__PURE__ */ new Map();
  const rots = [];
  for (const ref of ids) {
    const gap = checkpoint(options);
    if (gap) await gap;
    const rot = rotationToX(
      model.nrm[ref * 3] ?? 0,
      model.nrm[ref * 3 + 1] ?? 0,
      model.nrm[ref * 3 + 2] ?? 0
    );
    rots[ref] = rot;
    const mates = grid.band(
      model.xyz[ref * 3] ?? 0,
      model.xyz[ref * 3 + 1] ?? 0,
      model.xyz[ref * 3 + 2] ?? 0,
      minD,
      maxD,
      18
    );
    for (const other of mates) {
      const pair = pointPair(model, ref, other);
      if (!pair || pair.dist < minD || pair.dist > maxD) continue;
      const key = featureKey(pair.dist, pair.a1, pair.a2, pair.a3, distStep);
      const alpha = pairAlpha(
        rot,
        model.xyz[ref * 3] ?? 0,
        model.xyz[ref * 3 + 1] ?? 0,
        model.xyz[ref * 3 + 2] ?? 0,
        model.xyz[other * 3] ?? 0,
        model.xyz[other * 3 + 1] ?? 0,
        model.xyz[other * 3 + 2] ?? 0
      );
      const bucket = hash.get(key);
      if (bucket) {
        if (bucket.length < 48) bucket.push({ ref, alpha });
      } else hash.set(key, [{ ref, alpha }]);
    }
  }
  return { hash, rots };
}
function poseFromAlignment(model, modelRef, modelRot, scene, sceneRef, alpha) {
  const sceneRot = rotationToX(
    scene.nrm[sceneRef * 3] ?? 0,
    scene.nrm[sceneRef * 3 + 1] ?? 0,
    scene.nrm[sceneRef * 3 + 2] ?? 0
  );
  const r2 = mul33(transpose33(sceneRot), mul33(rotationX(alpha), modelRot));
  const mx = model.xyz[modelRef * 3] ?? 0;
  const my = model.xyz[modelRef * 3 + 1] ?? 0;
  const mz = model.xyz[modelRef * 3 + 2] ?? 0;
  const sx = scene.xyz[sceneRef * 3] ?? 0;
  const sy = scene.xyz[sceneRef * 3 + 1] ?? 0;
  const sz = scene.xyz[sceneRef * 3 + 2] ?? 0;
  return {
    r: r2,
    t: [
      sx - ((r2[0]?.[0] ?? 1) * mx + (r2[0]?.[1] ?? 0) * my + (r2[0]?.[2] ?? 0) * mz),
      sy - ((r2[1]?.[0] ?? 0) * mx + (r2[1]?.[1] ?? 1) * my + (r2[1]?.[2] ?? 0) * mz),
      sz - ((r2[2]?.[0] ?? 0) * mx + (r2[2]?.[1] ?? 0) * my + (r2[2]?.[2] ?? 1) * mz)
    ]
  };
}
function poseTightness(model, scene, rigid, unitToMm) {
  const moved = cloneCloud(model);
  applyRigid(moved, rigid);
  const tight = mmToUnits(4, unitToMm);
  const grid = buildGrid(moved, mmToUnits(2, unitToMm));
  const step = Math.max(1, Math.floor(scene.count / 420));
  const dists = [];
  let covered = 0;
  for (let i = 0; i < scene.count; i += step) {
    const index2 = grid.nearest(
      scene.xyz[i * 3] ?? 0,
      scene.xyz[i * 3 + 1] ?? 0,
      scene.xyz[i * 3 + 2] ?? 0,
      tight
    );
    if (index2 < 0) {
      dists.push(tight);
      continue;
    }
    const d2 = Math.hypot(
      (scene.xyz[i * 3] ?? 0) - (moved.xyz[index2 * 3] ?? 0),
      (scene.xyz[i * 3 + 1] ?? 0) - (moved.xyz[index2 * 3 + 1] ?? 0),
      (scene.xyz[i * 3 + 2] ?? 0) - (moved.xyz[index2 * 3 + 2] ?? 0)
    );
    dists.push(Math.min(d2, tight));
    if (d2 <= mmToUnits(1.2, unitToMm)) covered += 1;
  }
  dists.sort((a2, b2) => a2 - b2);
  const sideN = Math.max(8, Math.floor(dists.length * 0.4));
  let sum = 0;
  for (let i = 0; i < sideN; i += 1) sum += dists[i] ?? tight;
  return {
    side: dists.length ? sum / sideN : tight,
    cover: dists.length ? covered / dists.length : 0
  };
}
function rotationVector(r2) {
  const trace = (r2[0]?.[0] ?? 1) + (r2[1]?.[1] ?? 1) + (r2[2]?.[2] ?? 1);
  const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
  if (angle < 1e-5) return [0, 0, 0];
  const scale = angle / (2 * Math.sin(angle));
  return [
    ((r2[2]?.[1] ?? 0) - (r2[1]?.[2] ?? 0)) * scale,
    ((r2[0]?.[2] ?? 0) - (r2[2]?.[0] ?? 0)) * scale,
    ((r2[1]?.[0] ?? 0) - (r2[0]?.[1] ?? 0)) * scale
  ];
}
function cloudCentroid(cloud) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < cloud.count; i += 1) {
    x += cloud.xyz[i * 3] ?? 0;
    y += cloud.xyz[i * 3 + 1] ?? 0;
    z += cloud.xyz[i * 3 + 2] ?? 0;
  }
  const n2 = Math.max(cloud.count, 1);
  return [x / n2, y / n2, z / n2];
}
async function ppfSearch(model, scene, unitToMm, options) {
  if (model.count < 40 || scene.count < 40) return null;
  const minD = mmToUnits(3.2, unitToMm);
  const maxD = mmToUnits(14, unitToMm);
  const distStep = mmToUnits(2.4, unitToMm);
  const modelIds = strideIds(model.count, 900);
  const sceneIds = strideIds(scene.count, 220);
  const { hash, rots } = await buildPpfHash(model, modelIds, minD, maxD, distStep, options);
  const sceneGrid = buildGrid(scene, Math.max(maxD / 5, 1e-4));
  const votes = new Int32Array(model.count * PPF_ALPHA_BINS);
  const clustered = /* @__PURE__ */ new Map();
  const clusterStep = Math.max(mmToUnits(3.5, unitToMm), 1e-4);
  const centroid = cloudCentroid(model);
  for (const ref of sceneIds) {
    const gap = checkpoint(options);
    if (gap) await gap;
    votes.fill(0);
    const mates = sceneGrid.band(
      scene.xyz[ref * 3] ?? 0,
      scene.xyz[ref * 3 + 1] ?? 0,
      scene.xyz[ref * 3 + 2] ?? 0,
      minD,
      maxD,
      16
    );
    const sceneRot = rotationToX(
      scene.nrm[ref * 3] ?? 0,
      scene.nrm[ref * 3 + 1] ?? 0,
      scene.nrm[ref * 3 + 2] ?? 0
    );
    for (const other of mates) {
      const pair = pointPair(scene, ref, other);
      if (!pair || pair.dist < minD || pair.dist > maxD) continue;
      const key = featureKey(pair.dist, pair.a1, pair.a2, pair.a3, distStep);
      const bucket = hash.get(key);
      if (!bucket) continue;
      const alphaS = pairAlpha(
        sceneRot,
        scene.xyz[ref * 3] ?? 0,
        scene.xyz[ref * 3 + 1] ?? 0,
        scene.xyz[ref * 3 + 2] ?? 0,
        scene.xyz[other * 3] ?? 0,
        scene.xyz[other * 3 + 1] ?? 0,
        scene.xyz[other * 3 + 2] ?? 0
      );
      for (const entry of bucket) {
        let delta = alphaS - entry.alpha;
        delta %= Math.PI * 2;
        if (delta < 0) delta += Math.PI * 2;
        const bin = Math.round(delta / (Math.PI * 2) * PPF_ALPHA_BINS) % PPF_ALPHA_BINS;
        votes[entry.ref * PPF_ALPHA_BINS + bin] += 1;
      }
    }
    let bestVotes = 0;
    let bestIndex = -1;
    let bestBin = 0;
    for (const m of modelIds) {
      const base = m * PPF_ALPHA_BINS;
      for (let bin = 0; bin < PPF_ALPHA_BINS; bin += 1) {
        const prev2 = votes[base + (bin + PPF_ALPHA_BINS - 1) % PPF_ALPHA_BINS] ?? 0;
        const cur = votes[base + bin] ?? 0;
        const next = votes[base + (bin + 1) % PPF_ALPHA_BINS] ?? 0;
        const score = prev2 + cur + next;
        if (score > bestVotes) {
          bestVotes = score;
          bestIndex = m;
          bestBin = bin;
        }
      }
    }
    if (bestVotes < 4 || bestIndex < 0) continue;
    const modelRot = rots[bestIndex];
    if (!modelRot) continue;
    const alpha = bestBin / PPF_ALPHA_BINS * Math.PI * 2;
    const rigid = poseFromAlignment(model, bestIndex, modelRot, scene, ref, alpha);
    const rv = rotationVector(rigid.r);
    const mx = centroid[0];
    const my = centroid[1];
    const mz = centroid[2];
    const px = (rigid.r[0]?.[0] ?? 1) * mx + (rigid.r[0]?.[1] ?? 0) * my + (rigid.r[0]?.[2] ?? 0) * mz + rigid.t[0];
    const py = (rigid.r[1]?.[0] ?? 0) * mx + (rigid.r[1]?.[1] ?? 1) * my + (rigid.r[1]?.[2] ?? 0) * mz + rigid.t[1];
    const pz = (rigid.r[2]?.[0] ?? 0) * mx + (rigid.r[2]?.[1] ?? 0) * my + (rigid.r[2]?.[2] ?? 1) * mz + rigid.t[2];
    const cell = [
      Math.round(px / clusterStep),
      Math.round(py / clusterStep),
      Math.round(pz / clusterStep),
      Math.round((rv[0] ?? 0) / 0.2),
      Math.round((rv[1] ?? 0) / 0.2),
      Math.round((rv[2] ?? 0) / 0.2)
    ].join(":");
    const prev = clustered.get(cell);
    if (!prev || bestVotes > prev.peak) {
      clustered.set(cell, { votes: (prev?.votes ?? 0) + bestVotes, peak: bestVotes, rigid });
    } else {
      prev.votes += bestVotes;
    }
  }
  const ranked = [...clustered.values()].sort((a2, b2) => b2.votes - a2.votes).slice(0, 20);
  let best = null;
  let bestSide = mmToUnits(1.15, unitToMm);
  for (const row of ranked) {
    const gap = checkpoint(options);
    if (gap) await gap;
    const quality = poseTightness(model, scene, row.rigid, unitToMm);
    if (quality.cover < 0.1) continue;
    if (quality.side < bestSide) {
      bestSide = quality.side;
      best = row.rigid;
    }
  }
  return best;
}
async function globalPose(source, target, unitToMm, options) {
  const first = await ppfSearch(source, target, unitToMm, options);
  const firstQ = first ? poseTightness(source, target, first, unitToMm) : null;
  if (first && firstQ && firstQ.side <= mmToUnits(0.8, unitToMm) && firstQ.cover >= 0.14) {
    return first;
  }
  const flipped = await ppfSearch(flipCloudNormals(source), target, unitToMm, options);
  if (!flipped) return first;
  const flippedQ = poseTightness(source, target, flipped, unitToMm);
  if (!firstQ || flippedQ.side < firstQ.side) return flipped;
  return first;
}
function excludeMatched(target, aligned, unitToMm) {
  const thresh = mmToUnits(0.7, unitToMm);
  const grid = buildGrid(aligned, mmToUnits(1, unitToMm));
  const xyz = [];
  const nrm = [];
  for (let i = 0; i < target.count; i += 1) {
    const hit = grid.nearest(
      target.xyz[i * 3] ?? 0,
      target.xyz[i * 3 + 1] ?? 0,
      target.xyz[i * 3 + 2] ?? 0,
      thresh
    );
    if (hit >= 0) {
      const d2 = Math.hypot(
        (target.xyz[i * 3] ?? 0) - (aligned.xyz[hit * 3] ?? 0),
        (target.xyz[i * 3 + 1] ?? 0) - (aligned.xyz[hit * 3 + 1] ?? 0),
        (target.xyz[i * 3 + 2] ?? 0) - (aligned.xyz[hit * 3 + 2] ?? 0)
      );
      if (d2 <= thresh) continue;
    }
    xyz.push(
      target.xyz[i * 3] ?? 0,
      target.xyz[i * 3 + 1] ?? 0,
      target.xyz[i * 3 + 2] ?? 0
    );
    nrm.push(
      target.nrm[i * 3] ?? 0,
      target.nrm[i * 3 + 1] ?? 0,
      target.nrm[i * 3 + 2] ?? 0
    );
  }
  if (xyz.length / 3 < 80) return target;
  return { xyz: Float32Array.from(xyz), nrm: Float32Array.from(nrm), count: xyz.length / 3 };
}
function seatedFit(fit, unitToMm) {
  return fit.sideMean <= mmToUnits(0.72, unitToMm) && fit.coverage >= 0.05;
}
async function alignArch(source, target, unitToMm, options, emit, accept) {
  const ok = (matrix) => !accept || accept(matrix);
  const grid = buildGrid(target, mmToUnits(FIT_GRID_MM, unitToMm));
  const before = overlapFitness(source, target, grid, unitToMm);
  const inPlace = seatedFit(before, unitToMm) && ok(new Matrix4());
  const already = inPlace && before.sideMean <= mmToUnits(0.32, unitToMm);
  if (already) {
    emit?.(new Matrix4());
    return {
      matrix: new Matrix4(),
      before: before.mean,
      after: before.mean,
      inliers: before.inliers,
      cloud: source,
      seated: true,
      side: before.sideMean
    };
  }
  const local = cloneCloud(source);
  const localMatrix = await refineToTarget(local, target, unitToMm, false, options, emit);
  const localFit = overlapFitness(
    local,
    target,
    buildGrid(target, mmToUnits(FIT_GRID_MM, unitToMm)),
    unitToMm
  );
  const localOk = ok(localMatrix);
  let bestCloud = localOk ? local : source;
  let bestMatrix = localOk ? localMatrix : new Matrix4();
  let bestFit = localOk ? localFit : before;
  const deepEnough = localOk && seatedFit(localFit, unitToMm);
  if (!deepEnough) {
    const pose = await globalPose(source, target, unitToMm, options);
    if (pose) {
      let globalCloud = cloneCloud(source);
      applyRigid(globalCloud, pose);
      let matrix = new Matrix4();
      compose(matrix, pose);
      emit?.(matrix);
      const coarse = overlapFitness(
        globalCloud,
        target,
        buildGrid(target, mmToUnits(FIT_GRID_MM, unitToMm)),
        unitToMm
      );
      const poseMatrix = matrix.clone();
      const refined = await refineToTarget(
        globalCloud,
        target,
        unitToMm,
        true,
        options,
        emit && ((total) => emit(total.clone().multiply(poseMatrix)))
      );
      matrix.premultiply(refined);
      let fit = overlapFitness(
        globalCloud,
        target,
        buildGrid(target, mmToUnits(FIT_GRID_MM, unitToMm)),
        unitToMm
      );
      if (coarse.sideMean + mmToUnits(0.05, unitToMm) < fit.sideMean) {
        const posed = cloneCloud(source);
        applyRigid(posed, pose);
        globalCloud = posed;
        matrix = new Matrix4();
        compose(matrix, pose);
        fit = coarse;
      }
      if (ok(matrix) && (fit.coverage > bestFit.coverage + 0.05 || fit.coverage >= bestFit.coverage - 0.02 && fit.sideMean < bestFit.sideMean)) {
        bestCloud = globalCloud;
        bestMatrix = matrix;
        bestFit = fit;
      }
    }
  }
  const improved = bestFit.coverage > before.coverage + 0.08 || bestFit.sideMean + mmToUnits(0.15, unitToMm) < before.sideMean;
  if (!seatedFit(bestFit, unitToMm) || !improved || !ok(bestMatrix)) {
    emit?.(new Matrix4());
    return {
      matrix: new Matrix4(),
      before: before.mean,
      after: before.mean,
      inliers: before.inliers,
      cloud: source,
      seated: inPlace,
      side: before.sideMean
    };
  }
  emit?.(bestMatrix);
  return {
    matrix: bestMatrix,
    before: before.mean,
    after: bestFit.mean,
    inliers: bestFit.inliers,
    cloud: bestCloud,
    seated: true,
    side: bestFit.sideMean
  };
}
function planSample(geometry, cap) {
  const pos = geometry.getAttribute("position");
  const out2 = [];
  if (!pos) return out2;
  for (const i of strideIds(pos.count, cap)) out2.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  return out2;
}
function planAxes(points, matrix) {
  const e2 = matrix.elements;
  const moved = points.map(
    ([x, y, z]) => [
      (e2[0] ?? 1) * x + (e2[4] ?? 0) * y + (e2[8] ?? 0) * z + (e2[12] ?? 0),
      (e2[1] ?? 0) * x + (e2[5] ?? 1) * y + (e2[9] ?? 0) * z + (e2[13] ?? 0),
      (e2[2] ?? 0) * x + (e2[6] ?? 0) * y + (e2[10] ?? 1) * z + (e2[14] ?? 0)
    ]
  );
  return archPlanAxes(moved);
}
function occlusionPairOk(a2, b2, unitToMm) {
  const fa = a2;
  const fb = b2;
  if (!fa || !fb) return true;
  const dist = fa.center.distanceTo(fb.center) * unitToMm;
  return fa.anterior.dot(fb.anterior) >= 0.6 && Math.abs(fa.up.dot(fb.up)) >= 0.85 && dist >= 8 && dist <= 18;
}
const AXIS_ROTATIONS = (() => {
  const out2 = [];
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0]
  ];
  for (const perm of perms) {
    for (let signs = 0; signs < 8; signs += 1) {
      const m = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ];
      for (let row = 0; row < 3; row += 1) {
        m[row][perm[row]] = signs & 1 << row ? -1 : 1;
      }
      if (det33(m) > 0) out2.push(m);
    }
  }
  return out2;
})();
const SWEEP_ROTATIONS = (() => {
  const tilt = Math.PI / 180 * 36;
  const offsets = [
    [0, 0, 0],
    [tilt, 0, 0],
    [-tilt, 0, 0],
    [0, tilt, 0],
    [0, -tilt, 0],
    [0, 0, tilt],
    [0, 0, -tilt]
  ].map(([x, y, z]) => rodrigues(x ?? 0, y ?? 0, z ?? 0));
  const out2 = [];
  for (const offset of offsets) {
    for (const rot of AXIS_ROTATIONS) out2.push(mul33(offset, rot));
  }
  return out2;
})();
function rigidFromMatrix(matrix) {
  const e2 = matrix.elements;
  return {
    r: [
      [e2[0] ?? 1, e2[4] ?? 0, e2[8] ?? 0],
      [e2[1] ?? 0, e2[5] ?? 1, e2[9] ?? 0],
      [e2[2] ?? 0, e2[6] ?? 0, e2[10] ?? 1]
    ],
    t: [e2[12] ?? 0, e2[13] ?? 0, e2[14] ?? 0]
  };
}
function subsampleCloud(cloud, cap) {
  const ids = strideIds(cloud.count, cap);
  const xyz = new Float32Array(ids.length * 3);
  const nrm = new Float32Array(ids.length * 3);
  ids.forEach((index2, row) => {
    for (let k = 0; k < 3; k += 1) {
      xyz[row * 3 + k] = cloud.xyz[index2 * 3 + k] ?? 0;
      nrm[row * 3 + k] = cloud.nrm[index2 * 3 + k] ?? 0;
    }
  });
  return { xyz, nrm, count: ids.length };
}
function translationSeeds(source, rot, center, samples, sampleNormals, unitToMm, keep) {
  const cell = mmToUnits(1.8, unitToMm);
  const step = mmToUnits(4, unitToMm);
  const moved = new Float32Array(source.count * 3);
  const turned = new Float32Array(source.count * 3);
  const sMin = [Infinity, Infinity, Infinity];
  const sMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < source.count; i += 1) {
    const px = (source.xyz[i * 3] ?? 0) - center[0];
    const py = (source.xyz[i * 3 + 1] ?? 0) - center[1];
    const pz = (source.xyz[i * 3 + 2] ?? 0) - center[2];
    for (let row = 0; row < 3; row += 1) {
      const r2 = rot[row];
      const v = (r2[0] ?? 0) * px + (r2[1] ?? 0) * py + (r2[2] ?? 0) * pz;
      moved[i * 3 + row] = v;
      turned[i * 3 + row] = (r2[0] ?? 0) * (source.nrm[i * 3] ?? 0) + (r2[1] ?? 0) * (source.nrm[i * 3 + 1] ?? 0) + (r2[2] ?? 0) * (source.nrm[i * 3 + 2] ?? 0);
      if (v < sMin[row]) sMin[row] = v;
      if (v > sMax[row]) sMax[row] = v;
    }
  }
  const nx = Math.ceil((sMax[0] - sMin[0]) / cell) + 3;
  const ny = Math.ceil((sMax[1] - sMin[1]) / cell) + 3;
  const nz = Math.ceil((sMax[2] - sMin[2]) / cell) + 3;
  const occ = new Uint8Array(nx * ny * nz);
  const occN = new Float32Array(nx * ny * nz * 3);
  for (let i = 0; i < source.count; i += 1) {
    const ix = Math.floor((moved[i * 3] - sMin[0]) / cell) + 1;
    const iy = Math.floor((moved[i * 3 + 1] - sMin[1]) / cell) + 1;
    const iz = Math.floor((moved[i * 3 + 2] - sMin[2]) / cell) + 1;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const at = ((iz + dz) * ny + (iy + dy)) * nx + ix + dx;
          occ[at] = 1;
          occN[at * 3] = turned[i * 3];
          occN[at * 3 + 1] = turned[i * 3 + 1];
          occN[at * 3 + 2] = turned[i * 3 + 2];
        }
      }
    }
  }
  const n2 = samples.length / 3;
  const tMin = [Infinity, Infinity, Infinity];
  const tMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n2; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = samples[i * 3 + k];
      if (v < tMin[k]) tMin[k] = v;
      if (v > tMax[k]) tMax[k] = v;
    }
  }
  const lo = [0, 1, 2].map((k) => tMin[k] - sMax[k]);
  const hi = [0, 1, 2].map((k) => tMax[k] - sMin[k]);
  const floor = Math.max(6, Math.floor(n2 * 0.12));
  const found = [];
  for (let tx = lo[0]; tx <= hi[0]; tx += step) {
    for (let ty = lo[1]; ty <= hi[1]; ty += step) {
      for (let tz = lo[2]; tz <= hi[2]; tz += step) {
        let score = 0;
        for (let i = 0; i < n2; i += 1) {
          const ix = Math.floor((samples[i * 3] - tx - sMin[0]) / cell) + 1;
          if (ix < 0 || ix >= nx) continue;
          const iy = Math.floor((samples[i * 3 + 1] - ty - sMin[1]) / cell) + 1;
          if (iy < 0 || iy >= ny) continue;
          const iz = Math.floor((samples[i * 3 + 2] - tz - sMin[2]) / cell) + 1;
          if (iz < 0 || iz >= nz) continue;
          const at = (iz * ny + iy) * nx + ix;
          if (!occ[at]) continue;
          const dot = occN[at * 3] * sampleNormals[i * 3] + occN[at * 3 + 1] * sampleNormals[i * 3 + 1] + occN[at * 3 + 2] * sampleNormals[i * 3 + 2];
          if (Math.abs(dot) > 0.55) score += 1;
        }
        if (score >= floor) found.push({ t: [tx, ty, tz], score });
      }
    }
  }
  found.sort((a2, b2) => b2.score - a2.score);
  const apart = mmToUnits(7, unitToMm);
  const seeds = [];
  for (const row of found) {
    if (seeds.length >= keep) break;
    const near = seeds.some(
      ({ shift }) => Math.hypot(shift[0] - row.t[0], shift[1] - row.t[1], shift[2] - row.t[2]) < apart
    );
    if (near) continue;
    const t2 = [0, 1, 2].map((k) => {
      const r2 = rot[k];
      return row.t[k] - ((r2[0] ?? 0) * center[0] + (r2[1] ?? 0) * center[1] + (r2[2] ?? 0) * center[2]);
    });
    seeds.push({ rigid: { r: rot, t: t2 }, score: row.score, shift: row.t });
  }
  return seeds;
}
async function sweepArchPoses(source, target, unitToMm, options, emit, accept) {
  if (source.count < 80 || target.count < 80) return null;
  const center = cloudCentroid(source);
  const grid = buildGrid(target, mmToUnits(FIT_GRID_MM, unitToMm));
  const sampleIds = strideIds(target.count, 110);
  const samples = new Float32Array(sampleIds.length * 3);
  const sampleNormals = new Float32Array(sampleIds.length * 3);
  sampleIds.forEach((index2, row) => {
    for (let k = 0; k < 3; k += 1) {
      samples[row * 3 + k] = target.xyz[index2 * 3 + k] ?? 0;
      sampleNormals[row * 3 + k] = target.nrm[index2 * 3 + k] ?? 0;
    }
  });
  const coarse = subsampleCloud(source, 500);
  const seeds = [];
  for (const rot of SWEEP_ROTATIONS) {
    const gap = checkpoint(options);
    if (gap) await gap;
    seeds.push(...translationSeeds(coarse, rot, center, samples, sampleNormals, unitToMm, 1));
  }
  seeds.sort((a2, b2) => b2.score - a2.score);
  const screened = [];
  const ok = (matrix) => !accept || accept(matrix);
  for (const seed of seeds.slice(0, 20)) {
    const cloud = cloneCloud(coarse);
    applyRigid(cloud, seed.rigid);
    const matrix = new Matrix4();
    compose(matrix, seed.rigid);
    emit?.(matrix);
    const start = matrix.clone();
    matrix.premultiply(
      await refineToTarget(
        cloud,
        target,
        unitToMm,
        "screen",
        options,
        emit && ((total) => emit(total.clone().multiply(start)))
      )
    );
    if (!ok(matrix)) continue;
    screened.push({ matrix, fit: overlapFitness(cloud, target, grid, unitToMm) });
  }
  const rank2 = (fit) => fit.sideMean * unitToMm - fit.coverage * 4;
  screened.sort((a2, b2) => rank2(a2.fit) - rank2(b2.fit));
  let best = null;
  for (const row of screened.slice(0, 2)) {
    const cloud = cloneCloud(source);
    applyRigid(cloud, rigidFromMatrix(row.matrix));
    const matrix = row.matrix.clone();
    emit?.(matrix);
    const start = matrix.clone();
    matrix.premultiply(
      await refineToTarget(
        cloud,
        target,
        unitToMm,
        true,
        options,
        emit && ((total) => emit(total.clone().multiply(start)))
      )
    );
    const fit = overlapFitness(cloud, target, grid, unitToMm);
    if (!seatedFit(fit, unitToMm) || !ok(matrix)) continue;
    if (!best || fit.coverage > best.fit.coverage + 0.03 || fit.coverage >= best.fit.coverage - 0.01 && fit.sideMean < best.fit.sideMean) {
      best = { cloud, matrix, fit };
    }
  }
  emit?.(best ? best.matrix : new Matrix4());
  return best;
}
function mergeGeometries(geometries) {
  const xyz = [];
  const nrm = [];
  for (const geometry of geometries) {
    const cloud = sampleGeometry(geometry, 0.9, 2800);
    for (let i = 0; i < cloud.count; i += 1) {
      xyz.push(cloud.xyz[i * 3] ?? 0, cloud.xyz[i * 3 + 1] ?? 0, cloud.xyz[i * 3 + 2] ?? 0);
      nrm.push(cloud.nrm[i * 3] ?? 0, cloud.nrm[i * 3 + 1] ?? 0, cloud.nrm[i * 3 + 2] ?? 0);
    }
  }
  return { xyz: Float32Array.from(xyz), nrm: Float32Array.from(nrm), count: xyz.length / 3 };
}
function cropNear(cloud, ref, thresh) {
  const grid = buildGrid(ref, Math.max(thresh * 0.75, 1e-4));
  const xyz = [];
  const nrm = [];
  for (let i = 0; i < cloud.count; i += 1) {
    const hit = grid.nearest(
      cloud.xyz[i * 3] ?? 0,
      cloud.xyz[i * 3 + 1] ?? 0,
      cloud.xyz[i * 3 + 2] ?? 0,
      thresh
    );
    if (hit < 0) continue;
    const d2 = Math.hypot(
      (cloud.xyz[i * 3] ?? 0) - (ref.xyz[hit * 3] ?? 0),
      (cloud.xyz[i * 3 + 1] ?? 0) - (ref.xyz[hit * 3 + 1] ?? 0),
      (cloud.xyz[i * 3 + 2] ?? 0) - (ref.xyz[hit * 3 + 2] ?? 0)
    );
    if (d2 > thresh) continue;
    xyz.push(cloud.xyz[i * 3] ?? 0, cloud.xyz[i * 3 + 1] ?? 0, cloud.xyz[i * 3 + 2] ?? 0);
    nrm.push(cloud.nrm[i * 3] ?? 0, cloud.nrm[i * 3 + 1] ?? 0, cloud.nrm[i * 3 + 2] ?? 0);
  }
  return { xyz: Float32Array.from(xyz), nrm: Float32Array.from(nrm), count: xyz.length / 3 };
}
async function registerJawsToBiteResult(entries, options) {
  const fitted = [];
  const shown = /* @__PURE__ */ new Map();
  const onPose = options?.onPose;
  const tracked = {
    ...options,
    onPose: (geometry, matrix) => {
      shown.set(geometry, matrix.clone());
      onPose?.(geometry, matrix);
    }
  };
  try {
    return await registerJawsToBiteWork(entries, fitted, tracked);
  } catch (error2) {
    if (!(error2 instanceof BiteAlignCancelled)) throw error2;
    const identity = new Matrix4();
    return {
      seated: false,
      moved: false,
      stopped: true,
      partial: [...shown].filter(([, matrix]) => !matrix.equals(identity)).map(([geometry, matrix]) => ({ geometry, matrix }))
    };
  }
}
async function registerJawsToBiteWork(entries, fitted, options) {
  const none = { seated: false, moved: false, stopped: false, partial: [] };
  const bite = entries.filter((entry) => entry.role === "bite");
  const arches = entries.filter(
    (entry) => entry.role === "upper" || entry.role === "lower"
  );
  if (bite.length === 0 || arches.length === 0) return none;
  for (const entry of entries) {
    if (!entry.geometry.getAttribute("normal")) entry.geometry.computeVertexNormals();
  }
  resetYieldClock();
  await pause(options);
  const biteCloud = mergeGeometries(bite.map((entry) => entry.geometry));
  if (biteCloud.count < 80) return none;
  const unitToMm = geometryUnits(biteCloud, arches.map((entry) => entry.geometry));
  const sinkFor = (geometry) => {
    const onPose = options?.onPose;
    return onPose ? (matrix) => onPose(geometry, matrix) : void 0;
  };
  const order = [...arches].sort((a2, b2) => {
    const af = roughGap(a2.geometry, biteCloud, unitToMm);
    const bf = roughGap(b2.geometry, biteCloud, unitToMm);
    return af - bf;
  });
  const acceptFor = (self2, plan) => (matrix) => {
    const others = fitted.filter((other) => other !== self2 && other.seated);
    if (others.length === 0) return true;
    const mine = planAxes(plan, matrix);
    return others.every(
      (other) => occlusionPairOk(mine, planAxes(other.plan, other.matrix), unitToMm)
    );
  };
  let target = biteCloud;
  for (const entry of order) {
    await pause(options);
    const source = sampleGeometry(entry.geometry, mmToUnits(0.95, unitToMm), 2400);
    if (source.count < 80) continue;
    const radius = cloudRadius(source);
    const biteRadius = cloudRadius(target);
    if (radius > 1 && biteRadius > 1) {
      const ratio = radius / biteRadius;
      if (ratio > 8 || ratio < 0.05) continue;
    }
    const plan = planSample(entry.geometry, 1500);
    const aligned = await alignArch(
      source,
      target,
      unitToMm,
      options,
      sinkFor(entry.geometry),
      acceptFor(null, plan)
    );
    fitted.push({
      targetCount: target.count,
      plan,
      geometry: entry.geometry,
      role: entry.role,
      matrix: aligned.matrix,
      before: aligned.before,
      after: aligned.after,
      inliers: aligned.inliers,
      aligned: aligned.cloud,
      original: source,
      seated: aligned.seated,
      side: aligned.side
    });
    if (aligned.seated) {
      target = excludeMatched(target, aligned.cloud, unitToMm);
    }
  }
  const near = mmToUnits(1.2, unitToMm);
  const onBiteCenter = (cloud) => cloudCentroid(cropNear(cloud, biteCloud, near));
  const apart = (a2, b2) => {
    const ac = onBiteCenter(a2);
    const bc = onBiteCenter(b2);
    return Math.hypot(ac[0] - bc[0], ac[1] - bc[1], ac[2] - bc[2]) >= mmToUnits(4, unitToMm);
  };
  const remainFor = (row) => {
    let remain = biteCloud;
    for (const other of fitted) {
      if (other !== row && other.seated) remain = excludeMatched(remain, other.aligned, unitToMm);
    }
    return remain;
  };
  const seat = (row, cloud, matrix, fit) => {
    row.matrix.copy(matrix);
    row.aligned = cloud;
    row.after = fit.mean;
    row.inliers = fit.inliers;
    row.side = fit.sideMean;
    row.seated = true;
    sinkFor(row.geometry)?.(row.matrix);
  };
  const swept = /* @__PURE__ */ new Set();
  for (; ; ) {
    let progress = false;
    for (const row of fitted) {
      if (row.seated) continue;
      const remain = remainFor(row);
      if (remain.count >= row.targetCount) continue;
      row.targetCount = remain.count;
      const again = await alignArch(
        row.original,
        remain,
        unitToMm,
        options,
        sinkFor(row.geometry),
        acceptFor(row, row.plan)
      );
      if (!again.seated) continue;
      seat(row, again.cloud, again.matrix, {
        mean: again.after,
        inliers: again.inliers,
        coverage: 0,
        sideMean: again.side
      });
      progress = true;
    }
    if (progress) continue;
    if (!options?.sweepPoses) break;
    const pending = fitted.filter((row) => !row.seated && !swept.has(row));
    if (pending.length === 0) break;
    const contest = fitted.every((row) => !row.seated) ? pending : pending.slice(0, 1);
    const hits = [];
    for (const row of contest) {
      const hit = await sweepArchPoses(
        row.original,
        remainFor(row),
        unitToMm,
        options,
        sinkFor(row.geometry),
        acceptFor(row, row.plan)
      );
      if (hit) hits.push({ row, hit });
    }
    if (hits.length === 0) {
      for (const row of contest) swept.add(row);
      continue;
    }
    const rank2 = (fit) => fit.sideMean * unitToMm - fit.coverage * 4;
    hits.sort((a2, b2) => rank2(a2.hit.fit) - rank2(b2.hit.fit));
    const winner = hits[0];
    swept.add(winner.row);
    seat(winner.row, winner.hit.cloud, winner.hit.matrix, winner.hit.fit);
    for (const { row, hit } of hits.slice(1)) {
      if (apart(hit.cloud, winner.hit.cloud) && occlusionPairOk(
        planAxes(row.plan, hit.matrix),
        planAxes(winner.row.plan, winner.hit.matrix),
        unitToMm
      )) {
        swept.add(row);
        seat(row, hit.cloud, hit.matrix, hit.fit);
      } else {
        sinkFor(row.geometry)?.(new Matrix4());
      }
    }
    for (const row of contest) {
      if (!hits.some((entry) => entry.row === row)) swept.add(row);
    }
  }
  const identity = new Matrix4();
  const movedSeated = fitted.filter((row) => row.seated && !row.matrix.equals(identity));
  const unseated = fitted.filter((row) => !row.seated);
  if (options?.sweepPoses && movedSeated.length === 1 && unseated.length === 1) {
    const first = unseated[0];
    const second = movedSeated[0];
    const saved = { ...second, matrix: second.matrix.clone() };
    const unseat = (row) => {
      row.seated = false;
      row.matrix.identity();
      row.aligned = row.original;
      sinkFor(row.geometry)?.(row.matrix);
    };
    const trySeat = async (row) => {
      const remain = remainFor(row);
      const again = await alignArch(
        row.original,
        remain,
        unitToMm,
        options,
        sinkFor(row.geometry),
        acceptFor(row, row.plan)
      );
      if (again.seated) {
        seat(row, again.cloud, again.matrix, {
          mean: again.after,
          inliers: again.inliers,
          coverage: 0,
          sideMean: again.side
        });
        return true;
      }
      const hit = await sweepArchPoses(
        row.original,
        remain,
        unitToMm,
        options,
        sinkFor(row.geometry),
        acceptFor(row, row.plan)
      );
      if (hit) seat(row, hit.cloud, hit.matrix, hit.fit);
      return Boolean(hit);
    };
    unseat(second);
    if (!(await trySeat(first) && await trySeat(second))) {
      unseat(first);
      Object.assign(second, saved);
      sinkFor(second.geometry)?.(second.matrix);
    }
  }
  const upperRow = fitted.find((row) => row.role === "upper" && row.seated);
  const lowerRow = fitted.find((row) => row.role === "lower" && row.seated);
  if (upperRow && lowerRow && !apart(upperRow.aligned, lowerRow.aligned)) {
    const drop = upperRow.side > lowerRow.side + mmToUnits(0.05, unitToMm) ? upperRow : lowerRow;
    const keep = drop === upperRow ? lowerRow : upperRow;
    const remain = excludeMatched(biteCloud, keep.aligned, unitToMm);
    const again = await alignArch(
      drop.original,
      remain,
      unitToMm,
      options,
      sinkFor(drop.geometry),
      acceptFor(drop, drop.plan)
    );
    if (again.seated && cropNear(again.cloud, biteCloud, near).count > 30 && apart(again.cloud, keep.aligned)) {
      drop.matrix.copy(again.matrix);
      drop.aligned = again.cloud;
      drop.side = again.side;
      drop.after = again.after;
      drop.inliers = again.inliers;
      drop.seated = true;
    } else {
      drop.matrix.identity();
      drop.aligned = drop.original;
      drop.seated = false;
    }
    sinkFor(drop.geometry)?.(drop.matrix);
  }
  const hasBoth = ["upper", "lower"].every((role) => fitted.some((row) => row.role === role));
  const confirmed = fitted.filter((row) => row.seated);
  if (hasBoth && confirmed.length === 1 && !confirmed[0].matrix.equals(identity)) {
    const lone = confirmed[0];
    lone.seated = false;
    lone.matrix.identity();
    lone.aligned = lone.original;
    sinkFor(lone.geometry)?.(lone.matrix);
  }
  await pause(options);
  let seated = false;
  let moved = false;
  for (const row of fitted) {
    if (row.seated) seated = true;
    if (row.matrix.equals(new Matrix4())) continue;
    moved = true;
    row.geometry.applyMatrix4(row.matrix);
    row.geometry.computeVertexNormals();
    row.geometry.computeBoundingBox();
    console.info("[oral-scan] bite-fit", {
      role: row.role,
      beforeMm: Number((row.before * unitToMm).toFixed(3)),
      afterMm: Number((row.after * unitToMm).toFixed(3)),
      inliers: row.inliers
    });
  }
  return { seated, moved, stopped: false, partial: [] };
}
function geometryUnits(bite, arches) {
  let radius = cloudRadius(bite);
  for (const geometry of arches) {
    geometry.computeBoundingSphere();
    radius = Math.max(radius, geometry.boundingSphere?.radius ?? 0);
  }
  if (radius > 0 && radius < 5) return 1e3;
  if (radius > 400) return 1e-3;
  return 1;
}
function roughGap(geometry, target, unitToMm) {
  const source = sampleGeometry(geometry, mmToUnits(1.4, unitToMm), 600);
  const grid = buildGrid(target, mmToUnits(1.4, unitToMm));
  return overlapFitness(source, target, grid, unitToMm).mean;
}
const ROLE_ORDER = ["upper", "lower", "bite"];
function exportMesh(geometry) {
  const pos = geometry.getAttribute("position");
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    positions[i * 3] = pos.getX(i);
    positions[i * 3 + 1] = pos.getY(i);
    positions[i * 3 + 2] = pos.getZ(i);
  }
  const index2 = geometry.getIndex();
  const indices = new Uint32Array(index2 ? index2.count : pos.count);
  if (index2) {
    for (let i = 0; i < index2.count; i += 1) indices[i] = index2.getX(i);
  } else {
    for (let i = 0; i < pos.count; i += 1) indices[i] = i;
  }
  const color = geometry.getAttribute("color");
  return {
    positions,
    indices,
    colors: color && color.count === pos.count ? linearColorsToSrgbBytes(color) : null
  };
}
async function alignWorkScansToBite(inputs) {
  const roles = new Set(inputs.map((row) => row.role));
  if (!ROLE_ORDER.every((role) => roles.has(role))) return { status: "incomplete" };
  const entries = [];
  for (const input of inputs) {
    const parsed = await parseModelPreview(
      new File([input.bytes], input.fileName, { type: "application/octet-stream" })
    );
    const geometry = parsed.geometry;
    geometry.computeBoundingBox();
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    entries.push({ role: input.role, geometry });
  }
  const { moved } = await registerJawsToBiteResult(entries, { sweepPoses: true });
  const frame = estimateDentalFrame(entries);
  if (frame) reseatOcclusalOrigin(entries, frame);
  const files = [];
  for (const role of ROLE_ORDER) {
    const rows = entries.filter((entry) => entry.role === role);
    for (let index2 = 0; index2 < rows.length; index2 += 1) {
      const blob2 = encodeHpsCaDcm(exportMesh(rows[index2].geometry));
      files.push({
        role,
        fileName: abutsWorkScanFileName(role, index2),
        bytes: new Uint8Array(await blob2.arrayBuffer())
      });
    }
  }
  return { status: "aligned", files, moved };
}
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var utf8$5 = {};
var utils$q = {};
var support$4 = {};
var readable = { exports: {} };
var processNextickArgs = { exports: {} };
var hasRequiredProcessNextickArgs;
function requireProcessNextickArgs() {
  if (hasRequiredProcessNextickArgs) return processNextickArgs.exports;
  hasRequiredProcessNextickArgs = 1;
  if (typeof process === "undefined" || !process.version || process.version.indexOf("v0.") === 0 || process.version.indexOf("v1.") === 0 && process.version.indexOf("v1.8.") !== 0) {
    processNextickArgs.exports = { nextTick };
  } else {
    processNextickArgs.exports = process;
  }
  function nextTick(fn, arg1, arg2, arg3) {
    if (typeof fn !== "function") {
      throw new TypeError('"callback" argument must be a function');
    }
    var len = arguments.length;
    var args, i;
    switch (len) {
      case 0:
      case 1:
        return process.nextTick(fn);
      case 2:
        return process.nextTick(function afterTickOne() {
          fn.call(null, arg1);
        });
      case 3:
        return process.nextTick(function afterTickTwo() {
          fn.call(null, arg1, arg2);
        });
      case 4:
        return process.nextTick(function afterTickThree() {
          fn.call(null, arg1, arg2, arg3);
        });
      default:
        args = new Array(len - 1);
        i = 0;
        while (i < args.length) {
          args[i++] = arguments[i];
        }
        return process.nextTick(function afterTick() {
          fn.apply(null, args);
        });
    }
  }
  return processNextickArgs.exports;
}
var isarray;
var hasRequiredIsarray;
function requireIsarray() {
  if (hasRequiredIsarray) return isarray;
  hasRequiredIsarray = 1;
  var toString2 = {}.toString;
  isarray = Array.isArray || function(arr) {
    return toString2.call(arr) == "[object Array]";
  };
  return isarray;
}
var stream;
var hasRequiredStream;
function requireStream() {
  if (hasRequiredStream) return stream;
  hasRequiredStream = 1;
  stream = require$$0;
  return stream;
}
var safeBuffer = { exports: {} };
var hasRequiredSafeBuffer;
function requireSafeBuffer() {
  if (hasRequiredSafeBuffer) return safeBuffer.exports;
  hasRequiredSafeBuffer = 1;
  (function(module, exports) {
    var buffer = require$$0$1;
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  })(safeBuffer, safeBuffer.exports);
  return safeBuffer.exports;
}
var util = {};
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  function isArray(arg) {
    if (Array.isArray) {
      return Array.isArray(arg);
    }
    return objectToString(arg) === "[object Array]";
  }
  util.isArray = isArray;
  function isBoolean(arg) {
    return typeof arg === "boolean";
  }
  util.isBoolean = isBoolean;
  function isNull(arg) {
    return arg === null;
  }
  util.isNull = isNull;
  function isNullOrUndefined(arg) {
    return arg == null;
  }
  util.isNullOrUndefined = isNullOrUndefined;
  function isNumber(arg) {
    return typeof arg === "number";
  }
  util.isNumber = isNumber;
  function isString(arg) {
    return typeof arg === "string";
  }
  util.isString = isString;
  function isSymbol(arg) {
    return typeof arg === "symbol";
  }
  util.isSymbol = isSymbol;
  function isUndefined(arg) {
    return arg === void 0;
  }
  util.isUndefined = isUndefined;
  function isRegExp2(re) {
    return objectToString(re) === "[object RegExp]";
  }
  util.isRegExp = isRegExp2;
  function isObject(arg) {
    return typeof arg === "object" && arg !== null;
  }
  util.isObject = isObject;
  function isDate(d2) {
    return objectToString(d2) === "[object Date]";
  }
  util.isDate = isDate;
  function isError(e2) {
    return objectToString(e2) === "[object Error]" || e2 instanceof Error;
  }
  util.isError = isError;
  function isFunction(arg) {
    return typeof arg === "function";
  }
  util.isFunction = isFunction;
  function isPrimitive(arg) {
    return arg === null || typeof arg === "boolean" || typeof arg === "number" || typeof arg === "string" || typeof arg === "symbol" || // ES6 symbol
    typeof arg === "undefined";
  }
  util.isPrimitive = isPrimitive;
  util.isBuffer = require$$0$1.Buffer.isBuffer;
  function objectToString(o2) {
    return Object.prototype.toString.call(o2);
  }
  return util;
}
var inherits = { exports: {} };
var inherits_browser = { exports: {} };
var hasRequiredInherits_browser;
function requireInherits_browser() {
  if (hasRequiredInherits_browser) return inherits_browser.exports;
  hasRequiredInherits_browser = 1;
  if (typeof Object.create === "function") {
    inherits_browser.exports = function inherits2(ctor, superCtor) {
      if (superCtor) {
        ctor.super_ = superCtor;
        ctor.prototype = Object.create(superCtor.prototype, {
          constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
      }
    };
  } else {
    inherits_browser.exports = function inherits2(ctor, superCtor) {
      if (superCtor) {
        ctor.super_ = superCtor;
        var TempCtor = function() {
        };
        TempCtor.prototype = superCtor.prototype;
        ctor.prototype = new TempCtor();
        ctor.prototype.constructor = ctor;
      }
    };
  }
  return inherits_browser.exports;
}
var hasRequiredInherits;
function requireInherits() {
  if (hasRequiredInherits) return inherits.exports;
  hasRequiredInherits = 1;
  try {
    var util2 = require("util");
    if (typeof util2.inherits !== "function") throw "";
    inherits.exports = util2.inherits;
  } catch (e2) {
    inherits.exports = requireInherits_browser();
  }
  return inherits.exports;
}
var BufferList = { exports: {} };
var hasRequiredBufferList;
function requireBufferList() {
  if (hasRequiredBufferList) return BufferList.exports;
  hasRequiredBufferList = 1;
  (function(module) {
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    }
    var Buffer2 = requireSafeBuffer().Buffer;
    var util2 = require$$1;
    function copyBuffer(src, target, offset) {
      src.copy(target, offset);
    }
    module.exports = function() {
      function BufferList2() {
        _classCallCheck(this, BufferList2);
        this.head = null;
        this.tail = null;
        this.length = 0;
      }
      BufferList2.prototype.push = function push(v) {
        var entry = { data: v, next: null };
        if (this.length > 0) this.tail.next = entry;
        else this.head = entry;
        this.tail = entry;
        ++this.length;
      };
      BufferList2.prototype.unshift = function unshift(v) {
        var entry = { data: v, next: this.head };
        if (this.length === 0) this.tail = entry;
        this.head = entry;
        ++this.length;
      };
      BufferList2.prototype.shift = function shift() {
        if (this.length === 0) return;
        var ret = this.head.data;
        if (this.length === 1) this.head = this.tail = null;
        else this.head = this.head.next;
        --this.length;
        return ret;
      };
      BufferList2.prototype.clear = function clear() {
        this.head = this.tail = null;
        this.length = 0;
      };
      BufferList2.prototype.join = function join(s2) {
        if (this.length === 0) return "";
        var p = this.head;
        var ret = "" + p.data;
        while (p = p.next) {
          ret += s2 + p.data;
        }
        return ret;
      };
      BufferList2.prototype.concat = function concat2(n2) {
        if (this.length === 0) return Buffer2.alloc(0);
        var ret = Buffer2.allocUnsafe(n2 >>> 0);
        var p = this.head;
        var i = 0;
        while (p) {
          copyBuffer(p.data, ret, i);
          i += p.data.length;
          p = p.next;
        }
        return ret;
      };
      return BufferList2;
    }();
    if (util2 && util2.inspect && util2.inspect.custom) {
      module.exports.prototype[util2.inspect.custom] = function() {
        var obj = util2.inspect({ length: this.length });
        return this.constructor.name + " " + obj;
      };
    }
  })(BufferList);
  return BufferList.exports;
}
var destroy_1;
var hasRequiredDestroy;
function requireDestroy() {
  if (hasRequiredDestroy) return destroy_1;
  hasRequiredDestroy = 1;
  var pna = requireProcessNextickArgs();
  function destroy(err2, cb) {
    var _this = this;
    var readableDestroyed = this._readableState && this._readableState.destroyed;
    var writableDestroyed = this._writableState && this._writableState.destroyed;
    if (readableDestroyed || writableDestroyed) {
      if (cb) {
        cb(err2);
      } else if (err2) {
        if (!this._writableState) {
          pna.nextTick(emitErrorNT, this, err2);
        } else if (!this._writableState.errorEmitted) {
          this._writableState.errorEmitted = true;
          pna.nextTick(emitErrorNT, this, err2);
        }
      }
      return this;
    }
    if (this._readableState) {
      this._readableState.destroyed = true;
    }
    if (this._writableState) {
      this._writableState.destroyed = true;
    }
    this._destroy(err2 || null, function(err3) {
      if (!cb && err3) {
        if (!_this._writableState) {
          pna.nextTick(emitErrorNT, _this, err3);
        } else if (!_this._writableState.errorEmitted) {
          _this._writableState.errorEmitted = true;
          pna.nextTick(emitErrorNT, _this, err3);
        }
      } else if (cb) {
        cb(err3);
      }
    });
    return this;
  }
  function undestroy() {
    if (this._readableState) {
      this._readableState.destroyed = false;
      this._readableState.reading = false;
      this._readableState.ended = false;
      this._readableState.endEmitted = false;
    }
    if (this._writableState) {
      this._writableState.destroyed = false;
      this._writableState.ended = false;
      this._writableState.ending = false;
      this._writableState.finalCalled = false;
      this._writableState.prefinished = false;
      this._writableState.finished = false;
      this._writableState.errorEmitted = false;
    }
  }
  function emitErrorNT(self2, err2) {
    self2.emit("error", err2);
  }
  destroy_1 = {
    destroy,
    undestroy
  };
  return destroy_1;
}
var node;
var hasRequiredNode;
function requireNode() {
  if (hasRequiredNode) return node;
  hasRequiredNode = 1;
  node = require$$1.deprecate;
  return node;
}
var _stream_writable;
var hasRequired_stream_writable;
function require_stream_writable() {
  if (hasRequired_stream_writable) return _stream_writable;
  hasRequired_stream_writable = 1;
  var pna = requireProcessNextickArgs();
  _stream_writable = Writable;
  function CorkedRequest(state) {
    var _this = this;
    this.next = null;
    this.entry = null;
    this.finish = function() {
      onCorkedFinish(_this, state);
    };
  }
  var asyncWrite = !process.browser && ["v0.10", "v0.9."].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : pna.nextTick;
  var Duplex;
  Writable.WritableState = WritableState;
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  var internalUtil = {
    deprecate: requireNode()
  };
  var Stream = requireStream();
  var Buffer2 = requireSafeBuffer().Buffer;
  var OurUint8Array = (typeof commonjsGlobal !== "undefined" ? commonjsGlobal : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
  };
  function _uint8ArrayToBuffer(chunk) {
    return Buffer2.from(chunk);
  }
  function _isUint8Array(obj) {
    return Buffer2.isBuffer(obj) || obj instanceof OurUint8Array;
  }
  var destroyImpl = requireDestroy();
  util2.inherits(Writable, Stream);
  function nop() {
  }
  function WritableState(options, stream2) {
    Duplex = Duplex || require_stream_duplex();
    options = options || {};
    var isDuplex = stream2 instanceof Duplex;
    this.objectMode = !!options.objectMode;
    if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;
    var hwm = options.highWaterMark;
    var writableHwm = options.writableHighWaterMark;
    var defaultHwm = this.objectMode ? 16 : 16 * 1024;
    if (hwm || hwm === 0) this.highWaterMark = hwm;
    else if (isDuplex && (writableHwm || writableHwm === 0)) this.highWaterMark = writableHwm;
    else this.highWaterMark = defaultHwm;
    this.highWaterMark = Math.floor(this.highWaterMark);
    this.finalCalled = false;
    this.needDrain = false;
    this.ending = false;
    this.ended = false;
    this.finished = false;
    this.destroyed = false;
    var noDecode = options.decodeStrings === false;
    this.decodeStrings = !noDecode;
    this.defaultEncoding = options.defaultEncoding || "utf8";
    this.length = 0;
    this.writing = false;
    this.corked = 0;
    this.sync = true;
    this.bufferProcessing = false;
    this.onwrite = function(er) {
      onwrite(stream2, er);
    };
    this.writecb = null;
    this.writelen = 0;
    this.bufferedRequest = null;
    this.lastBufferedRequest = null;
    this.pendingcb = 0;
    this.prefinished = false;
    this.errorEmitted = false;
    this.bufferedRequestCount = 0;
    this.corkedRequestsFree = new CorkedRequest(this);
  }
  WritableState.prototype.getBuffer = function getBuffer() {
    var current = this.bufferedRequest;
    var out2 = [];
    while (current) {
      out2.push(current);
      current = current.next;
    }
    return out2;
  };
  (function() {
    try {
      Object.defineProperty(WritableState.prototype, "buffer", {
        get: internalUtil.deprecate(function() {
          return this.getBuffer();
        }, "_writableState.buffer is deprecated. Use _writableState.getBuffer instead.", "DEP0003")
      });
    } catch (_) {
    }
  })();
  var realHasInstance;
  if (typeof Symbol === "function" && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === "function") {
    realHasInstance = Function.prototype[Symbol.hasInstance];
    Object.defineProperty(Writable, Symbol.hasInstance, {
      value: function(object2) {
        if (realHasInstance.call(this, object2)) return true;
        if (this !== Writable) return false;
        return object2 && object2._writableState instanceof WritableState;
      }
    });
  } else {
    realHasInstance = function(object2) {
      return object2 instanceof this;
    };
  }
  function Writable(options) {
    Duplex = Duplex || require_stream_duplex();
    if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
      return new Writable(options);
    }
    this._writableState = new WritableState(options, this);
    this.writable = true;
    if (options) {
      if (typeof options.write === "function") this._write = options.write;
      if (typeof options.writev === "function") this._writev = options.writev;
      if (typeof options.destroy === "function") this._destroy = options.destroy;
      if (typeof options.final === "function") this._final = options.final;
    }
    Stream.call(this);
  }
  Writable.prototype.pipe = function() {
    this.emit("error", new Error("Cannot pipe, not readable"));
  };
  function writeAfterEnd(stream2, cb) {
    var er = new Error("write after end");
    stream2.emit("error", er);
    pna.nextTick(cb, er);
  }
  function validChunk(stream2, state, chunk, cb) {
    var valid = true;
    var er = false;
    if (chunk === null) {
      er = new TypeError("May not write null values to stream");
    } else if (typeof chunk !== "string" && chunk !== void 0 && !state.objectMode) {
      er = new TypeError("Invalid non-string/buffer chunk");
    }
    if (er) {
      stream2.emit("error", er);
      pna.nextTick(cb, er);
      valid = false;
    }
    return valid;
  }
  Writable.prototype.write = function(chunk, encoding, cb) {
    var state = this._writableState;
    var ret = false;
    var isBuf = !state.objectMode && _isUint8Array(chunk);
    if (isBuf && !Buffer2.isBuffer(chunk)) {
      chunk = _uint8ArrayToBuffer(chunk);
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = null;
    }
    if (isBuf) encoding = "buffer";
    else if (!encoding) encoding = state.defaultEncoding;
    if (typeof cb !== "function") cb = nop;
    if (state.ended) writeAfterEnd(this, cb);
    else if (isBuf || validChunk(this, state, chunk, cb)) {
      state.pendingcb++;
      ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
    }
    return ret;
  };
  Writable.prototype.cork = function() {
    var state = this._writableState;
    state.corked++;
  };
  Writable.prototype.uncork = function() {
    var state = this._writableState;
    if (state.corked) {
      state.corked--;
      if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
    }
  };
  Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
    if (typeof encoding === "string") encoding = encoding.toLowerCase();
    if (!(["hex", "utf8", "utf-8", "ascii", "binary", "base64", "ucs2", "ucs-2", "utf16le", "utf-16le", "raw"].indexOf((encoding + "").toLowerCase()) > -1)) throw new TypeError("Unknown encoding: " + encoding);
    this._writableState.defaultEncoding = encoding;
    return this;
  };
  function decodeChunk(state, chunk, encoding) {
    if (!state.objectMode && state.decodeStrings !== false && typeof chunk === "string") {
      chunk = Buffer2.from(chunk, encoding);
    }
    return chunk;
  }
  Object.defineProperty(Writable.prototype, "writableHighWaterMark", {
    // making it explicit this property is not enumerable
    // because otherwise some prototype manipulation in
    // userland will fail
    enumerable: false,
    get: function() {
      return this._writableState.highWaterMark;
    }
  });
  function writeOrBuffer(stream2, state, isBuf, chunk, encoding, cb) {
    if (!isBuf) {
      var newChunk = decodeChunk(state, chunk, encoding);
      if (chunk !== newChunk) {
        isBuf = true;
        encoding = "buffer";
        chunk = newChunk;
      }
    }
    var len = state.objectMode ? 1 : chunk.length;
    state.length += len;
    var ret = state.length < state.highWaterMark;
    if (!ret) state.needDrain = true;
    if (state.writing || state.corked) {
      var last = state.lastBufferedRequest;
      state.lastBufferedRequest = {
        chunk,
        encoding,
        isBuf,
        callback: cb,
        next: null
      };
      if (last) {
        last.next = state.lastBufferedRequest;
      } else {
        state.bufferedRequest = state.lastBufferedRequest;
      }
      state.bufferedRequestCount += 1;
    } else {
      doWrite(stream2, state, false, len, chunk, encoding, cb);
    }
    return ret;
  }
  function doWrite(stream2, state, writev, len, chunk, encoding, cb) {
    state.writelen = len;
    state.writecb = cb;
    state.writing = true;
    state.sync = true;
    if (writev) stream2._writev(chunk, state.onwrite);
    else stream2._write(chunk, encoding, state.onwrite);
    state.sync = false;
  }
  function onwriteError(stream2, state, sync, er, cb) {
    --state.pendingcb;
    if (sync) {
      pna.nextTick(cb, er);
      pna.nextTick(finishMaybe, stream2, state);
      stream2._writableState.errorEmitted = true;
      stream2.emit("error", er);
    } else {
      cb(er);
      stream2._writableState.errorEmitted = true;
      stream2.emit("error", er);
      finishMaybe(stream2, state);
    }
  }
  function onwriteStateUpdate(state) {
    state.writing = false;
    state.writecb = null;
    state.length -= state.writelen;
    state.writelen = 0;
  }
  function onwrite(stream2, er) {
    var state = stream2._writableState;
    var sync = state.sync;
    var cb = state.writecb;
    onwriteStateUpdate(state);
    if (er) onwriteError(stream2, state, sync, er, cb);
    else {
      var finished = needFinish(state);
      if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
        clearBuffer(stream2, state);
      }
      if (sync) {
        asyncWrite(afterWrite, stream2, state, finished, cb);
      } else {
        afterWrite(stream2, state, finished, cb);
      }
    }
  }
  function afterWrite(stream2, state, finished, cb) {
    if (!finished) onwriteDrain(stream2, state);
    state.pendingcb--;
    cb();
    finishMaybe(stream2, state);
  }
  function onwriteDrain(stream2, state) {
    if (state.length === 0 && state.needDrain) {
      state.needDrain = false;
      stream2.emit("drain");
    }
  }
  function clearBuffer(stream2, state) {
    state.bufferProcessing = true;
    var entry = state.bufferedRequest;
    if (stream2._writev && entry && entry.next) {
      var l2 = state.bufferedRequestCount;
      var buffer = new Array(l2);
      var holder = state.corkedRequestsFree;
      holder.entry = entry;
      var count = 0;
      var allBuffers = true;
      while (entry) {
        buffer[count] = entry;
        if (!entry.isBuf) allBuffers = false;
        entry = entry.next;
        count += 1;
      }
      buffer.allBuffers = allBuffers;
      doWrite(stream2, state, true, state.length, buffer, "", holder.finish);
      state.pendingcb++;
      state.lastBufferedRequest = null;
      if (holder.next) {
        state.corkedRequestsFree = holder.next;
        holder.next = null;
      } else {
        state.corkedRequestsFree = new CorkedRequest(state);
      }
      state.bufferedRequestCount = 0;
    } else {
      while (entry) {
        var chunk = entry.chunk;
        var encoding = entry.encoding;
        var cb = entry.callback;
        var len = state.objectMode ? 1 : chunk.length;
        doWrite(stream2, state, false, len, chunk, encoding, cb);
        entry = entry.next;
        state.bufferedRequestCount--;
        if (state.writing) {
          break;
        }
      }
      if (entry === null) state.lastBufferedRequest = null;
    }
    state.bufferedRequest = entry;
    state.bufferProcessing = false;
  }
  Writable.prototype._write = function(chunk, encoding, cb) {
    cb(new Error("_write() is not implemented"));
  };
  Writable.prototype._writev = null;
  Writable.prototype.end = function(chunk, encoding, cb) {
    var state = this._writableState;
    if (typeof chunk === "function") {
      cb = chunk;
      chunk = null;
      encoding = null;
    } else if (typeof encoding === "function") {
      cb = encoding;
      encoding = null;
    }
    if (chunk !== null && chunk !== void 0) this.write(chunk, encoding);
    if (state.corked) {
      state.corked = 1;
      this.uncork();
    }
    if (!state.ending) endWritable(this, state, cb);
  };
  function needFinish(state) {
    return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
  }
  function callFinal(stream2, state) {
    stream2._final(function(err2) {
      state.pendingcb--;
      if (err2) {
        stream2.emit("error", err2);
      }
      state.prefinished = true;
      stream2.emit("prefinish");
      finishMaybe(stream2, state);
    });
  }
  function prefinish(stream2, state) {
    if (!state.prefinished && !state.finalCalled) {
      if (typeof stream2._final === "function") {
        state.pendingcb++;
        state.finalCalled = true;
        pna.nextTick(callFinal, stream2, state);
      } else {
        state.prefinished = true;
        stream2.emit("prefinish");
      }
    }
  }
  function finishMaybe(stream2, state) {
    var need = needFinish(state);
    if (need) {
      prefinish(stream2, state);
      if (state.pendingcb === 0) {
        state.finished = true;
        stream2.emit("finish");
      }
    }
    return need;
  }
  function endWritable(stream2, state, cb) {
    state.ending = true;
    finishMaybe(stream2, state);
    if (cb) {
      if (state.finished) pna.nextTick(cb);
      else stream2.once("finish", cb);
    }
    state.ended = true;
    stream2.writable = false;
  }
  function onCorkedFinish(corkReq, state, err2) {
    var entry = corkReq.entry;
    corkReq.entry = null;
    while (entry) {
      var cb = entry.callback;
      state.pendingcb--;
      cb(err2);
      entry = entry.next;
    }
    state.corkedRequestsFree.next = corkReq;
  }
  Object.defineProperty(Writable.prototype, "destroyed", {
    get: function() {
      if (this._writableState === void 0) {
        return false;
      }
      return this._writableState.destroyed;
    },
    set: function(value) {
      if (!this._writableState) {
        return;
      }
      this._writableState.destroyed = value;
    }
  });
  Writable.prototype.destroy = destroyImpl.destroy;
  Writable.prototype._undestroy = destroyImpl.undestroy;
  Writable.prototype._destroy = function(err2, cb) {
    this.end();
    cb(err2);
  };
  return _stream_writable;
}
var _stream_duplex;
var hasRequired_stream_duplex;
function require_stream_duplex() {
  if (hasRequired_stream_duplex) return _stream_duplex;
  hasRequired_stream_duplex = 1;
  var pna = requireProcessNextickArgs();
  var objectKeys = Object.keys || function(obj) {
    var keys2 = [];
    for (var key in obj) {
      keys2.push(key);
    }
    return keys2;
  };
  _stream_duplex = Duplex;
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  var Readable = require_stream_readable();
  var Writable = require_stream_writable();
  util2.inherits(Duplex, Readable);
  {
    var keys = objectKeys(Writable.prototype);
    for (var v = 0; v < keys.length; v++) {
      var method = keys[v];
      if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
    }
  }
  function Duplex(options) {
    if (!(this instanceof Duplex)) return new Duplex(options);
    Readable.call(this, options);
    Writable.call(this, options);
    if (options && options.readable === false) this.readable = false;
    if (options && options.writable === false) this.writable = false;
    this.allowHalfOpen = true;
    if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;
    this.once("end", onend);
  }
  Object.defineProperty(Duplex.prototype, "writableHighWaterMark", {
    // making it explicit this property is not enumerable
    // because otherwise some prototype manipulation in
    // userland will fail
    enumerable: false,
    get: function() {
      return this._writableState.highWaterMark;
    }
  });
  function onend() {
    if (this.allowHalfOpen || this._writableState.ended) return;
    pna.nextTick(onEndNT, this);
  }
  function onEndNT(self2) {
    self2.end();
  }
  Object.defineProperty(Duplex.prototype, "destroyed", {
    get: function() {
      if (this._readableState === void 0 || this._writableState === void 0) {
        return false;
      }
      return this._readableState.destroyed && this._writableState.destroyed;
    },
    set: function(value) {
      if (this._readableState === void 0 || this._writableState === void 0) {
        return;
      }
      this._readableState.destroyed = value;
      this._writableState.destroyed = value;
    }
  });
  Duplex.prototype._destroy = function(err2, cb) {
    this.push(null);
    this.end();
    pna.nextTick(cb, err2);
  };
  return _stream_duplex;
}
var string_decoder = {};
var hasRequiredString_decoder;
function requireString_decoder() {
  if (hasRequiredString_decoder) return string_decoder;
  hasRequiredString_decoder = 1;
  var Buffer2 = requireSafeBuffer().Buffer;
  var isEncoding = Buffer2.isEncoding || function(encoding) {
    encoding = "" + encoding;
    switch (encoding && encoding.toLowerCase()) {
      case "hex":
      case "utf8":
      case "utf-8":
      case "ascii":
      case "binary":
      case "base64":
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
      case "raw":
        return true;
      default:
        return false;
    }
  };
  function _normalizeEncoding(enc) {
    if (!enc) return "utf8";
    var retried;
    while (true) {
      switch (enc) {
        case "utf8":
        case "utf-8":
          return "utf8";
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return "utf16le";
        case "latin1":
        case "binary":
          return "latin1";
        case "base64":
        case "ascii":
        case "hex":
          return enc;
        default:
          if (retried) return;
          enc = ("" + enc).toLowerCase();
          retried = true;
      }
    }
  }
  function normalizeEncoding(enc) {
    var nenc = _normalizeEncoding(enc);
    if (typeof nenc !== "string" && (Buffer2.isEncoding === isEncoding || !isEncoding(enc))) throw new Error("Unknown encoding: " + enc);
    return nenc || enc;
  }
  string_decoder.StringDecoder = StringDecoder;
  function StringDecoder(encoding) {
    this.encoding = normalizeEncoding(encoding);
    var nb;
    switch (this.encoding) {
      case "utf16le":
        this.text = utf16Text;
        this.end = utf16End;
        nb = 4;
        break;
      case "utf8":
        this.fillLast = utf8FillLast;
        nb = 4;
        break;
      case "base64":
        this.text = base64Text;
        this.end = base64End;
        nb = 3;
        break;
      default:
        this.write = simpleWrite;
        this.end = simpleEnd;
        return;
    }
    this.lastNeed = 0;
    this.lastTotal = 0;
    this.lastChar = Buffer2.allocUnsafe(nb);
  }
  StringDecoder.prototype.write = function(buf) {
    if (buf.length === 0) return "";
    var r2;
    var i;
    if (this.lastNeed) {
      r2 = this.fillLast(buf);
      if (r2 === void 0) return "";
      i = this.lastNeed;
      this.lastNeed = 0;
    } else {
      i = 0;
    }
    if (i < buf.length) return r2 ? r2 + this.text(buf, i) : this.text(buf, i);
    return r2 || "";
  };
  StringDecoder.prototype.end = utf8End;
  StringDecoder.prototype.text = utf8Text;
  StringDecoder.prototype.fillLast = function(buf) {
    if (this.lastNeed <= buf.length) {
      buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
      return this.lastChar.toString(this.encoding, 0, this.lastTotal);
    }
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
    this.lastNeed -= buf.length;
  };
  function utf8CheckByte(byte) {
    if (byte <= 127) return 0;
    else if (byte >> 5 === 6) return 2;
    else if (byte >> 4 === 14) return 3;
    else if (byte >> 3 === 30) return 4;
    return byte >> 6 === 2 ? -1 : -2;
  }
  function utf8CheckIncomplete(self2, buf, i) {
    var j = buf.length - 1;
    if (j < i) return 0;
    var nb = utf8CheckByte(buf[j]);
    if (nb >= 0) {
      if (nb > 0) self2.lastNeed = nb - 1;
      return nb;
    }
    if (--j < i || nb === -2) return 0;
    nb = utf8CheckByte(buf[j]);
    if (nb >= 0) {
      if (nb > 0) self2.lastNeed = nb - 2;
      return nb;
    }
    if (--j < i || nb === -2) return 0;
    nb = utf8CheckByte(buf[j]);
    if (nb >= 0) {
      if (nb > 0) {
        if (nb === 2) nb = 0;
        else self2.lastNeed = nb - 3;
      }
      return nb;
    }
    return 0;
  }
  function utf8CheckExtraBytes(self2, buf, p) {
    if ((buf[0] & 192) !== 128) {
      self2.lastNeed = 0;
      return "�";
    }
    if (self2.lastNeed > 1 && buf.length > 1) {
      if ((buf[1] & 192) !== 128) {
        self2.lastNeed = 1;
        return "�";
      }
      if (self2.lastNeed > 2 && buf.length > 2) {
        if ((buf[2] & 192) !== 128) {
          self2.lastNeed = 2;
          return "�";
        }
      }
    }
  }
  function utf8FillLast(buf) {
    var p = this.lastTotal - this.lastNeed;
    var r2 = utf8CheckExtraBytes(this, buf);
    if (r2 !== void 0) return r2;
    if (this.lastNeed <= buf.length) {
      buf.copy(this.lastChar, p, 0, this.lastNeed);
      return this.lastChar.toString(this.encoding, 0, this.lastTotal);
    }
    buf.copy(this.lastChar, p, 0, buf.length);
    this.lastNeed -= buf.length;
  }
  function utf8Text(buf, i) {
    var total = utf8CheckIncomplete(this, buf, i);
    if (!this.lastNeed) return buf.toString("utf8", i);
    this.lastTotal = total;
    var end = buf.length - (total - this.lastNeed);
    buf.copy(this.lastChar, 0, end);
    return buf.toString("utf8", i, end);
  }
  function utf8End(buf) {
    var r2 = buf && buf.length ? this.write(buf) : "";
    if (this.lastNeed) return r2 + "�";
    return r2;
  }
  function utf16Text(buf, i) {
    if ((buf.length - i) % 2 === 0) {
      var r2 = buf.toString("utf16le", i);
      if (r2) {
        var c2 = r2.charCodeAt(r2.length - 1);
        if (c2 >= 55296 && c2 <= 56319) {
          this.lastNeed = 2;
          this.lastTotal = 4;
          this.lastChar[0] = buf[buf.length - 2];
          this.lastChar[1] = buf[buf.length - 1];
          return r2.slice(0, -1);
        }
      }
      return r2;
    }
    this.lastNeed = 1;
    this.lastTotal = 2;
    this.lastChar[0] = buf[buf.length - 1];
    return buf.toString("utf16le", i, buf.length - 1);
  }
  function utf16End(buf) {
    var r2 = buf && buf.length ? this.write(buf) : "";
    if (this.lastNeed) {
      var end = this.lastTotal - this.lastNeed;
      return r2 + this.lastChar.toString("utf16le", 0, end);
    }
    return r2;
  }
  function base64Text(buf, i) {
    var n2 = (buf.length - i) % 3;
    if (n2 === 0) return buf.toString("base64", i);
    this.lastNeed = 3 - n2;
    this.lastTotal = 3;
    if (n2 === 1) {
      this.lastChar[0] = buf[buf.length - 1];
    } else {
      this.lastChar[0] = buf[buf.length - 2];
      this.lastChar[1] = buf[buf.length - 1];
    }
    return buf.toString("base64", i, buf.length - n2);
  }
  function base64End(buf) {
    var r2 = buf && buf.length ? this.write(buf) : "";
    if (this.lastNeed) return r2 + this.lastChar.toString("base64", 0, 3 - this.lastNeed);
    return r2;
  }
  function simpleWrite(buf) {
    return buf.toString(this.encoding);
  }
  function simpleEnd(buf) {
    return buf && buf.length ? this.write(buf) : "";
  }
  return string_decoder;
}
var _stream_readable;
var hasRequired_stream_readable;
function require_stream_readable() {
  if (hasRequired_stream_readable) return _stream_readable;
  hasRequired_stream_readable = 1;
  var pna = requireProcessNextickArgs();
  _stream_readable = Readable;
  var isArray = requireIsarray();
  var Duplex;
  Readable.ReadableState = ReadableState;
  require$$2.EventEmitter;
  var EElistenerCount = function(emitter, type) {
    return emitter.listeners(type).length;
  };
  var Stream = requireStream();
  var Buffer2 = requireSafeBuffer().Buffer;
  var OurUint8Array = (typeof commonjsGlobal !== "undefined" ? commonjsGlobal : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
  };
  function _uint8ArrayToBuffer(chunk) {
    return Buffer2.from(chunk);
  }
  function _isUint8Array(obj) {
    return Buffer2.isBuffer(obj) || obj instanceof OurUint8Array;
  }
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  var debugUtil = require$$1;
  var debug = void 0;
  if (debugUtil && debugUtil.debuglog) {
    debug = debugUtil.debuglog("stream");
  } else {
    debug = function() {
    };
  }
  var BufferList2 = requireBufferList();
  var destroyImpl = requireDestroy();
  var StringDecoder;
  util2.inherits(Readable, Stream);
  var kProxyEvents = ["error", "close", "destroy", "pause", "resume"];
  function prependListener(emitter, event, fn) {
    if (typeof emitter.prependListener === "function") return emitter.prependListener(event, fn);
    if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);
    else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);
    else emitter._events[event] = [fn, emitter._events[event]];
  }
  function ReadableState(options, stream2) {
    Duplex = Duplex || require_stream_duplex();
    options = options || {};
    var isDuplex = stream2 instanceof Duplex;
    this.objectMode = !!options.objectMode;
    if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;
    var hwm = options.highWaterMark;
    var readableHwm = options.readableHighWaterMark;
    var defaultHwm = this.objectMode ? 16 : 16 * 1024;
    if (hwm || hwm === 0) this.highWaterMark = hwm;
    else if (isDuplex && (readableHwm || readableHwm === 0)) this.highWaterMark = readableHwm;
    else this.highWaterMark = defaultHwm;
    this.highWaterMark = Math.floor(this.highWaterMark);
    this.buffer = new BufferList2();
    this.length = 0;
    this.pipes = null;
    this.pipesCount = 0;
    this.flowing = null;
    this.ended = false;
    this.endEmitted = false;
    this.reading = false;
    this.sync = true;
    this.needReadable = false;
    this.emittedReadable = false;
    this.readableListening = false;
    this.resumeScheduled = false;
    this.destroyed = false;
    this.defaultEncoding = options.defaultEncoding || "utf8";
    this.awaitDrain = 0;
    this.readingMore = false;
    this.decoder = null;
    this.encoding = null;
    if (options.encoding) {
      if (!StringDecoder) StringDecoder = requireString_decoder().StringDecoder;
      this.decoder = new StringDecoder(options.encoding);
      this.encoding = options.encoding;
    }
  }
  function Readable(options) {
    Duplex = Duplex || require_stream_duplex();
    if (!(this instanceof Readable)) return new Readable(options);
    this._readableState = new ReadableState(options, this);
    this.readable = true;
    if (options) {
      if (typeof options.read === "function") this._read = options.read;
      if (typeof options.destroy === "function") this._destroy = options.destroy;
    }
    Stream.call(this);
  }
  Object.defineProperty(Readable.prototype, "destroyed", {
    get: function() {
      if (this._readableState === void 0) {
        return false;
      }
      return this._readableState.destroyed;
    },
    set: function(value) {
      if (!this._readableState) {
        return;
      }
      this._readableState.destroyed = value;
    }
  });
  Readable.prototype.destroy = destroyImpl.destroy;
  Readable.prototype._undestroy = destroyImpl.undestroy;
  Readable.prototype._destroy = function(err2, cb) {
    this.push(null);
    cb(err2);
  };
  Readable.prototype.push = function(chunk, encoding) {
    var state = this._readableState;
    var skipChunkCheck;
    if (!state.objectMode) {
      if (typeof chunk === "string") {
        encoding = encoding || state.defaultEncoding;
        if (encoding !== state.encoding) {
          chunk = Buffer2.from(chunk, encoding);
          encoding = "";
        }
        skipChunkCheck = true;
      }
    } else {
      skipChunkCheck = true;
    }
    return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
  };
  Readable.prototype.unshift = function(chunk) {
    return readableAddChunk(this, chunk, null, true, false);
  };
  function readableAddChunk(stream2, chunk, encoding, addToFront, skipChunkCheck) {
    var state = stream2._readableState;
    if (chunk === null) {
      state.reading = false;
      onEofChunk(stream2, state);
    } else {
      var er;
      if (!skipChunkCheck) er = chunkInvalid(state, chunk);
      if (er) {
        stream2.emit("error", er);
      } else if (state.objectMode || chunk && chunk.length > 0) {
        if (typeof chunk !== "string" && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer2.prototype) {
          chunk = _uint8ArrayToBuffer(chunk);
        }
        if (addToFront) {
          if (state.endEmitted) stream2.emit("error", new Error("stream.unshift() after end event"));
          else addChunk(stream2, state, chunk, true);
        } else if (state.ended) {
          stream2.emit("error", new Error("stream.push() after EOF"));
        } else {
          state.reading = false;
          if (state.decoder && !encoding) {
            chunk = state.decoder.write(chunk);
            if (state.objectMode || chunk.length !== 0) addChunk(stream2, state, chunk, false);
            else maybeReadMore(stream2, state);
          } else {
            addChunk(stream2, state, chunk, false);
          }
        }
      } else if (!addToFront) {
        state.reading = false;
      }
    }
    return needMoreData(state);
  }
  function addChunk(stream2, state, chunk, addToFront) {
    if (state.flowing && state.length === 0 && !state.sync) {
      stream2.emit("data", chunk);
      stream2.read(0);
    } else {
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) state.buffer.unshift(chunk);
      else state.buffer.push(chunk);
      if (state.needReadable) emitReadable(stream2);
    }
    maybeReadMore(stream2, state);
  }
  function chunkInvalid(state, chunk) {
    var er;
    if (!_isUint8Array(chunk) && typeof chunk !== "string" && chunk !== void 0 && !state.objectMode) {
      er = new TypeError("Invalid non-string/buffer chunk");
    }
    return er;
  }
  function needMoreData(state) {
    return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
  }
  Readable.prototype.isPaused = function() {
    return this._readableState.flowing === false;
  };
  Readable.prototype.setEncoding = function(enc) {
    if (!StringDecoder) StringDecoder = requireString_decoder().StringDecoder;
    this._readableState.decoder = new StringDecoder(enc);
    this._readableState.encoding = enc;
    return this;
  };
  var MAX_HWM = 8388608;
  function computeNewHighWaterMark(n2) {
    if (n2 >= MAX_HWM) {
      n2 = MAX_HWM;
    } else {
      n2--;
      n2 |= n2 >>> 1;
      n2 |= n2 >>> 2;
      n2 |= n2 >>> 4;
      n2 |= n2 >>> 8;
      n2 |= n2 >>> 16;
      n2++;
    }
    return n2;
  }
  function howMuchToRead(n2, state) {
    if (n2 <= 0 || state.length === 0 && state.ended) return 0;
    if (state.objectMode) return 1;
    if (n2 !== n2) {
      if (state.flowing && state.length) return state.buffer.head.data.length;
      else return state.length;
    }
    if (n2 > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n2);
    if (n2 <= state.length) return n2;
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    }
    return state.length;
  }
  Readable.prototype.read = function(n2) {
    debug("read", n2);
    n2 = parseInt(n2, 10);
    var state = this._readableState;
    var nOrig = n2;
    if (n2 !== 0) state.emittedReadable = false;
    if (n2 === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
      debug("read: emitReadable", state.length, state.ended);
      if (state.length === 0 && state.ended) endReadable(this);
      else emitReadable(this);
      return null;
    }
    n2 = howMuchToRead(n2, state);
    if (n2 === 0 && state.ended) {
      if (state.length === 0) endReadable(this);
      return null;
    }
    var doRead = state.needReadable;
    debug("need readable", doRead);
    if (state.length === 0 || state.length - n2 < state.highWaterMark) {
      doRead = true;
      debug("length less than watermark", doRead);
    }
    if (state.ended || state.reading) {
      doRead = false;
      debug("reading or ended", doRead);
    } else if (doRead) {
      debug("do read");
      state.reading = true;
      state.sync = true;
      if (state.length === 0) state.needReadable = true;
      this._read(state.highWaterMark);
      state.sync = false;
      if (!state.reading) n2 = howMuchToRead(nOrig, state);
    }
    var ret;
    if (n2 > 0) ret = fromList(n2, state);
    else ret = null;
    if (ret === null) {
      state.needReadable = true;
      n2 = 0;
    } else {
      state.length -= n2;
    }
    if (state.length === 0) {
      if (!state.ended) state.needReadable = true;
      if (nOrig !== n2 && state.ended) endReadable(this);
    }
    if (ret !== null) this.emit("data", ret);
    return ret;
  };
  function onEofChunk(stream2, state) {
    if (state.ended) return;
    if (state.decoder) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) {
        state.buffer.push(chunk);
        state.length += state.objectMode ? 1 : chunk.length;
      }
    }
    state.ended = true;
    emitReadable(stream2);
  }
  function emitReadable(stream2) {
    var state = stream2._readableState;
    state.needReadable = false;
    if (!state.emittedReadable) {
      debug("emitReadable", state.flowing);
      state.emittedReadable = true;
      if (state.sync) pna.nextTick(emitReadable_, stream2);
      else emitReadable_(stream2);
    }
  }
  function emitReadable_(stream2) {
    debug("emit readable");
    stream2.emit("readable");
    flow(stream2);
  }
  function maybeReadMore(stream2, state) {
    if (!state.readingMore) {
      state.readingMore = true;
      pna.nextTick(maybeReadMore_, stream2, state);
    }
  }
  function maybeReadMore_(stream2, state) {
    var len = state.length;
    while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
      debug("maybeReadMore read 0");
      stream2.read(0);
      if (len === state.length)
        break;
      else len = state.length;
    }
    state.readingMore = false;
  }
  Readable.prototype._read = function(n2) {
    this.emit("error", new Error("_read() is not implemented"));
  };
  Readable.prototype.pipe = function(dest, pipeOpts) {
    var src = this;
    var state = this._readableState;
    switch (state.pipesCount) {
      case 0:
        state.pipes = dest;
        break;
      case 1:
        state.pipes = [state.pipes, dest];
        break;
      default:
        state.pipes.push(dest);
        break;
    }
    state.pipesCount += 1;
    debug("pipe count=%d opts=%j", state.pipesCount, pipeOpts);
    var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
    var endFn = doEnd ? onend : unpipe;
    if (state.endEmitted) pna.nextTick(endFn);
    else src.once("end", endFn);
    dest.on("unpipe", onunpipe);
    function onunpipe(readable2, unpipeInfo) {
      debug("onunpipe");
      if (readable2 === src) {
        if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
          unpipeInfo.hasUnpiped = true;
          cleanup();
        }
      }
    }
    function onend() {
      debug("onend");
      dest.end();
    }
    var ondrain = pipeOnDrain(src);
    dest.on("drain", ondrain);
    var cleanedUp = false;
    function cleanup() {
      debug("cleanup");
      dest.removeListener("close", onclose);
      dest.removeListener("finish", onfinish);
      dest.removeListener("drain", ondrain);
      dest.removeListener("error", onerror);
      dest.removeListener("unpipe", onunpipe);
      src.removeListener("end", onend);
      src.removeListener("end", unpipe);
      src.removeListener("data", ondata);
      cleanedUp = true;
      if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
    }
    var increasedAwaitDrain = false;
    src.on("data", ondata);
    function ondata(chunk) {
      debug("ondata");
      increasedAwaitDrain = false;
      var ret = dest.write(chunk);
      if (false === ret && !increasedAwaitDrain) {
        if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
          debug("false write response, pause", state.awaitDrain);
          state.awaitDrain++;
          increasedAwaitDrain = true;
        }
        src.pause();
      }
    }
    function onerror(er) {
      debug("onerror", er);
      unpipe();
      dest.removeListener("error", onerror);
      if (EElistenerCount(dest, "error") === 0) dest.emit("error", er);
    }
    prependListener(dest, "error", onerror);
    function onclose() {
      dest.removeListener("finish", onfinish);
      unpipe();
    }
    dest.once("close", onclose);
    function onfinish() {
      debug("onfinish");
      dest.removeListener("close", onclose);
      unpipe();
    }
    dest.once("finish", onfinish);
    function unpipe() {
      debug("unpipe");
      src.unpipe(dest);
    }
    dest.emit("pipe", src);
    if (!state.flowing) {
      debug("pipe resume");
      src.resume();
    }
    return dest;
  };
  function pipeOnDrain(src) {
    return function() {
      var state = src._readableState;
      debug("pipeOnDrain", state.awaitDrain);
      if (state.awaitDrain) state.awaitDrain--;
      if (state.awaitDrain === 0 && EElistenerCount(src, "data")) {
        state.flowing = true;
        flow(src);
      }
    };
  }
  Readable.prototype.unpipe = function(dest) {
    var state = this._readableState;
    var unpipeInfo = { hasUnpiped: false };
    if (state.pipesCount === 0) return this;
    if (state.pipesCount === 1) {
      if (dest && dest !== state.pipes) return this;
      if (!dest) dest = state.pipes;
      state.pipes = null;
      state.pipesCount = 0;
      state.flowing = false;
      if (dest) dest.emit("unpipe", this, unpipeInfo);
      return this;
    }
    if (!dest) {
      var dests = state.pipes;
      var len = state.pipesCount;
      state.pipes = null;
      state.pipesCount = 0;
      state.flowing = false;
      for (var i = 0; i < len; i++) {
        dests[i].emit("unpipe", this, { hasUnpiped: false });
      }
      return this;
    }
    var index2 = indexOf(state.pipes, dest);
    if (index2 === -1) return this;
    state.pipes.splice(index2, 1);
    state.pipesCount -= 1;
    if (state.pipesCount === 1) state.pipes = state.pipes[0];
    dest.emit("unpipe", this, unpipeInfo);
    return this;
  };
  Readable.prototype.on = function(ev, fn) {
    var res = Stream.prototype.on.call(this, ev, fn);
    if (ev === "data") {
      if (this._readableState.flowing !== false) this.resume();
    } else if (ev === "readable") {
      var state = this._readableState;
      if (!state.endEmitted && !state.readableListening) {
        state.readableListening = state.needReadable = true;
        state.emittedReadable = false;
        if (!state.reading) {
          pna.nextTick(nReadingNextTick, this);
        } else if (state.length) {
          emitReadable(this);
        }
      }
    }
    return res;
  };
  Readable.prototype.addListener = Readable.prototype.on;
  function nReadingNextTick(self2) {
    debug("readable nexttick read 0");
    self2.read(0);
  }
  Readable.prototype.resume = function() {
    var state = this._readableState;
    if (!state.flowing) {
      debug("resume");
      state.flowing = true;
      resume(this, state);
    }
    return this;
  };
  function resume(stream2, state) {
    if (!state.resumeScheduled) {
      state.resumeScheduled = true;
      pna.nextTick(resume_, stream2, state);
    }
  }
  function resume_(stream2, state) {
    if (!state.reading) {
      debug("resume read 0");
      stream2.read(0);
    }
    state.resumeScheduled = false;
    state.awaitDrain = 0;
    stream2.emit("resume");
    flow(stream2);
    if (state.flowing && !state.reading) stream2.read(0);
  }
  Readable.prototype.pause = function() {
    debug("call pause flowing=%j", this._readableState.flowing);
    if (false !== this._readableState.flowing) {
      debug("pause");
      this._readableState.flowing = false;
      this.emit("pause");
    }
    return this;
  };
  function flow(stream2) {
    var state = stream2._readableState;
    debug("flow", state.flowing);
    while (state.flowing && stream2.read() !== null) {
    }
  }
  Readable.prototype.wrap = function(stream2) {
    var _this = this;
    var state = this._readableState;
    var paused = false;
    stream2.on("end", function() {
      debug("wrapped end");
      if (state.decoder && !state.ended) {
        var chunk = state.decoder.end();
        if (chunk && chunk.length) _this.push(chunk);
      }
      _this.push(null);
    });
    stream2.on("data", function(chunk) {
      debug("wrapped data");
      if (state.decoder) chunk = state.decoder.write(chunk);
      if (state.objectMode && (chunk === null || chunk === void 0)) return;
      else if (!state.objectMode && (!chunk || !chunk.length)) return;
      var ret = _this.push(chunk);
      if (!ret) {
        paused = true;
        stream2.pause();
      }
    });
    for (var i in stream2) {
      if (this[i] === void 0 && typeof stream2[i] === "function") {
        this[i] = /* @__PURE__ */ function(method) {
          return function() {
            return stream2[method].apply(stream2, arguments);
          };
        }(i);
      }
    }
    for (var n2 = 0; n2 < kProxyEvents.length; n2++) {
      stream2.on(kProxyEvents[n2], this.emit.bind(this, kProxyEvents[n2]));
    }
    this._read = function(n3) {
      debug("wrapped _read", n3);
      if (paused) {
        paused = false;
        stream2.resume();
      }
    };
    return this;
  };
  Object.defineProperty(Readable.prototype, "readableHighWaterMark", {
    // making it explicit this property is not enumerable
    // because otherwise some prototype manipulation in
    // userland will fail
    enumerable: false,
    get: function() {
      return this._readableState.highWaterMark;
    }
  });
  Readable._fromList = fromList;
  function fromList(n2, state) {
    if (state.length === 0) return null;
    var ret;
    if (state.objectMode) ret = state.buffer.shift();
    else if (!n2 || n2 >= state.length) {
      if (state.decoder) ret = state.buffer.join("");
      else if (state.buffer.length === 1) ret = state.buffer.head.data;
      else ret = state.buffer.concat(state.length);
      state.buffer.clear();
    } else {
      ret = fromListPartial(n2, state.buffer, state.decoder);
    }
    return ret;
  }
  function fromListPartial(n2, list, hasStrings) {
    var ret;
    if (n2 < list.head.data.length) {
      ret = list.head.data.slice(0, n2);
      list.head.data = list.head.data.slice(n2);
    } else if (n2 === list.head.data.length) {
      ret = list.shift();
    } else {
      ret = hasStrings ? copyFromBufferString(n2, list) : copyFromBuffer(n2, list);
    }
    return ret;
  }
  function copyFromBufferString(n2, list) {
    var p = list.head;
    var c2 = 1;
    var ret = p.data;
    n2 -= ret.length;
    while (p = p.next) {
      var str = p.data;
      var nb = n2 > str.length ? str.length : n2;
      if (nb === str.length) ret += str;
      else ret += str.slice(0, n2);
      n2 -= nb;
      if (n2 === 0) {
        if (nb === str.length) {
          ++c2;
          if (p.next) list.head = p.next;
          else list.head = list.tail = null;
        } else {
          list.head = p;
          p.data = str.slice(nb);
        }
        break;
      }
      ++c2;
    }
    list.length -= c2;
    return ret;
  }
  function copyFromBuffer(n2, list) {
    var ret = Buffer2.allocUnsafe(n2);
    var p = list.head;
    var c2 = 1;
    p.data.copy(ret);
    n2 -= p.data.length;
    while (p = p.next) {
      var buf = p.data;
      var nb = n2 > buf.length ? buf.length : n2;
      buf.copy(ret, ret.length - n2, 0, nb);
      n2 -= nb;
      if (n2 === 0) {
        if (nb === buf.length) {
          ++c2;
          if (p.next) list.head = p.next;
          else list.head = list.tail = null;
        } else {
          list.head = p;
          p.data = buf.slice(nb);
        }
        break;
      }
      ++c2;
    }
    list.length -= c2;
    return ret;
  }
  function endReadable(stream2) {
    var state = stream2._readableState;
    if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');
    if (!state.endEmitted) {
      state.ended = true;
      pna.nextTick(endReadableNT, state, stream2);
    }
  }
  function endReadableNT(state, stream2) {
    if (!state.endEmitted && state.length === 0) {
      state.endEmitted = true;
      stream2.readable = false;
      stream2.emit("end");
    }
  }
  function indexOf(xs, x) {
    for (var i = 0, l2 = xs.length; i < l2; i++) {
      if (xs[i] === x) return i;
    }
    return -1;
  }
  return _stream_readable;
}
var _stream_transform;
var hasRequired_stream_transform;
function require_stream_transform() {
  if (hasRequired_stream_transform) return _stream_transform;
  hasRequired_stream_transform = 1;
  _stream_transform = Transform;
  var Duplex = require_stream_duplex();
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  util2.inherits(Transform, Duplex);
  function afterTransform(er, data) {
    var ts = this._transformState;
    ts.transforming = false;
    var cb = ts.writecb;
    if (!cb) {
      return this.emit("error", new Error("write callback called multiple times"));
    }
    ts.writechunk = null;
    ts.writecb = null;
    if (data != null)
      this.push(data);
    cb(er);
    var rs = this._readableState;
    rs.reading = false;
    if (rs.needReadable || rs.length < rs.highWaterMark) {
      this._read(rs.highWaterMark);
    }
  }
  function Transform(options) {
    if (!(this instanceof Transform)) return new Transform(options);
    Duplex.call(this, options);
    this._transformState = {
      afterTransform: afterTransform.bind(this),
      needTransform: false,
      transforming: false,
      writecb: null,
      writechunk: null,
      writeencoding: null
    };
    this._readableState.needReadable = true;
    this._readableState.sync = false;
    if (options) {
      if (typeof options.transform === "function") this._transform = options.transform;
      if (typeof options.flush === "function") this._flush = options.flush;
    }
    this.on("prefinish", prefinish);
  }
  function prefinish() {
    var _this = this;
    if (typeof this._flush === "function") {
      this._flush(function(er, data) {
        done(_this, er, data);
      });
    } else {
      done(this, null, null);
    }
  }
  Transform.prototype.push = function(chunk, encoding) {
    this._transformState.needTransform = false;
    return Duplex.prototype.push.call(this, chunk, encoding);
  };
  Transform.prototype._transform = function(chunk, encoding, cb) {
    throw new Error("_transform() is not implemented");
  };
  Transform.prototype._write = function(chunk, encoding, cb) {
    var ts = this._transformState;
    ts.writecb = cb;
    ts.writechunk = chunk;
    ts.writeencoding = encoding;
    if (!ts.transforming) {
      var rs = this._readableState;
      if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
    }
  };
  Transform.prototype._read = function(n2) {
    var ts = this._transformState;
    if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
      ts.transforming = true;
      this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
    } else {
      ts.needTransform = true;
    }
  };
  Transform.prototype._destroy = function(err2, cb) {
    var _this2 = this;
    Duplex.prototype._destroy.call(this, err2, function(err22) {
      cb(err22);
      _this2.emit("close");
    });
  };
  function done(stream2, er, data) {
    if (er) return stream2.emit("error", er);
    if (data != null)
      stream2.push(data);
    if (stream2._writableState.length) throw new Error("Calling transform done when ws.length != 0");
    if (stream2._transformState.transforming) throw new Error("Calling transform done when still transforming");
    return stream2.push(null);
  }
  return _stream_transform;
}
var _stream_passthrough;
var hasRequired_stream_passthrough;
function require_stream_passthrough() {
  if (hasRequired_stream_passthrough) return _stream_passthrough;
  hasRequired_stream_passthrough = 1;
  _stream_passthrough = PassThrough;
  var Transform = require_stream_transform();
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  util2.inherits(PassThrough, Transform);
  function PassThrough(options) {
    if (!(this instanceof PassThrough)) return new PassThrough(options);
    Transform.call(this, options);
  }
  PassThrough.prototype._transform = function(chunk, encoding, cb) {
    cb(null, chunk);
  };
  return _stream_passthrough;
}
var hasRequiredReadable;
function requireReadable() {
  if (hasRequiredReadable) return readable.exports;
  hasRequiredReadable = 1;
  (function(module, exports) {
    var Stream = require$$0;
    if (process.env.READABLE_STREAM === "disable" && Stream) {
      module.exports = Stream;
      exports = module.exports = Stream.Readable;
      exports.Readable = Stream.Readable;
      exports.Writable = Stream.Writable;
      exports.Duplex = Stream.Duplex;
      exports.Transform = Stream.Transform;
      exports.PassThrough = Stream.PassThrough;
      exports.Stream = Stream;
    } else {
      exports = module.exports = require_stream_readable();
      exports.Stream = Stream || exports;
      exports.Readable = exports;
      exports.Writable = require_stream_writable();
      exports.Duplex = require_stream_duplex();
      exports.Transform = require_stream_transform();
      exports.PassThrough = require_stream_passthrough();
    }
  })(readable, readable.exports);
  return readable.exports;
}
var nodestream;
var blob;
support$4.base64 = true;
support$4.array = true;
support$4.string = true;
support$4.arraybuffer = typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
support$4.nodebuffer = typeof Buffer !== "undefined";
support$4.uint8array = typeof Uint8Array !== "undefined";
if (typeof ArrayBuffer === "undefined") {
  blob = support$4.blob = false;
} else {
  var buffer = new ArrayBuffer(0);
  try {
    blob = support$4.blob = new Blob([buffer], {
      type: "application/zip"
    }).size === 0;
  } catch (e2) {
    try {
      var Builder = self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder;
      var builder = new Builder();
      builder.append(buffer);
      blob = support$4.blob = builder.getBlob("application/zip").size === 0;
    } catch (e3) {
      blob = support$4.blob = false;
    }
  }
}
try {
  nodestream = support$4.nodestream = !!requireReadable().Readable;
} catch (e2) {
  nodestream = support$4.nodestream = false;
}
var base64$1 = {};
var hasRequiredBase64;
function requireBase64() {
  if (hasRequiredBase64) return base64$1;
  hasRequiredBase64 = 1;
  var utils2 = requireUtils();
  var support2 = support$4;
  var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  base64$1.encode = function(input) {
    var output = [];
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0, len = input.length, remainingBytes = len;
    var isArray = utils2.getTypeOf(input) !== "string";
    while (i < input.length) {
      remainingBytes = len - i;
      if (!isArray) {
        chr1 = input.charCodeAt(i++);
        chr2 = i < len ? input.charCodeAt(i++) : 0;
        chr3 = i < len ? input.charCodeAt(i++) : 0;
      } else {
        chr1 = input[i++];
        chr2 = i < len ? input[i++] : 0;
        chr3 = i < len ? input[i++] : 0;
      }
      enc1 = chr1 >> 2;
      enc2 = (chr1 & 3) << 4 | chr2 >> 4;
      enc3 = remainingBytes > 1 ? (chr2 & 15) << 2 | chr3 >> 6 : 64;
      enc4 = remainingBytes > 2 ? chr3 & 63 : 64;
      output.push(_keyStr.charAt(enc1) + _keyStr.charAt(enc2) + _keyStr.charAt(enc3) + _keyStr.charAt(enc4));
    }
    return output.join("");
  };
  base64$1.decode = function(input) {
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0, resultIndex = 0;
    var dataUrlPrefix = "data:";
    if (input.substr(0, dataUrlPrefix.length) === dataUrlPrefix) {
      throw new Error("Invalid base64 input, it looks like a data url.");
    }
    input = input.replace(/[^A-Za-z0-9+/=]/g, "");
    var totalLength = input.length * 3 / 4;
    if (input.charAt(input.length - 1) === _keyStr.charAt(64)) {
      totalLength--;
    }
    if (input.charAt(input.length - 2) === _keyStr.charAt(64)) {
      totalLength--;
    }
    if (totalLength % 1 !== 0) {
      throw new Error("Invalid base64 input, bad content length.");
    }
    var output;
    if (support2.uint8array) {
      output = new Uint8Array(totalLength | 0);
    } else {
      output = new Array(totalLength | 0);
    }
    while (i < input.length) {
      enc1 = _keyStr.indexOf(input.charAt(i++));
      enc2 = _keyStr.indexOf(input.charAt(i++));
      enc3 = _keyStr.indexOf(input.charAt(i++));
      enc4 = _keyStr.indexOf(input.charAt(i++));
      chr1 = enc1 << 2 | enc2 >> 4;
      chr2 = (enc2 & 15) << 4 | enc3 >> 2;
      chr3 = (enc3 & 3) << 6 | enc4;
      output[resultIndex++] = chr1;
      if (enc3 !== 64) {
        output[resultIndex++] = chr2;
      }
      if (enc4 !== 64) {
        output[resultIndex++] = chr3;
      }
    }
    return output;
  };
  return base64$1;
}
var nodejsUtils$2 = {
  /**
   * True if this is running in Nodejs, will be undefined in a browser.
   * In a browser, browserify won't include this file and the whole module
   * will be resolved an empty object.
   */
  isNode: typeof Buffer !== "undefined",
  /**
   * Create a new nodejs Buffer from an existing content.
   * @param {Object} data the data to pass to the constructor.
   * @param {String} encoding the encoding to use.
   * @return {Buffer} a new Buffer.
   */
  newBufferFrom: function(data, encoding) {
    if (Buffer.from && Buffer.from !== Uint8Array.from) {
      return Buffer.from(data, encoding);
    } else {
      if (typeof data === "number") {
        throw new Error('The "data" argument must not be a number');
      }
      return new Buffer(data, encoding);
    }
  },
  /**
   * Create a new nodejs Buffer with the specified size.
   * @param {Integer} size the size of the buffer.
   * @return {Buffer} a new Buffer.
   */
  allocBuffer: function(size) {
    if (Buffer.alloc) {
      return Buffer.alloc(size);
    } else {
      var buf = new Buffer(size);
      buf.fill(0);
      return buf;
    }
  },
  /**
   * Find out if an object is a Buffer.
   * @param {Object} b the object to test.
   * @return {Boolean} true if the object is a Buffer, false otherwise.
   */
  isBuffer: function(b2) {
    return Buffer.isBuffer(b2);
  },
  isStream: function(obj) {
    return obj && typeof obj.on === "function" && typeof obj.pause === "function" && typeof obj.resume === "function";
  }
};
var lib$2;
var hasRequiredLib$1;
function requireLib$1() {
  if (hasRequiredLib$1) return lib$2;
  hasRequiredLib$1 = 1;
  var Mutation = commonjsGlobal.MutationObserver || commonjsGlobal.WebKitMutationObserver;
  var scheduleDrain;
  if (process.browser) {
    if (Mutation) {
      var called = 0;
      var observer = new Mutation(nextTick);
      var element = commonjsGlobal.document.createTextNode("");
      observer.observe(element, {
        characterData: true
      });
      scheduleDrain = function() {
        element.data = called = ++called % 2;
      };
    } else if (!commonjsGlobal.setImmediate && typeof commonjsGlobal.MessageChannel !== "undefined") {
      var channel = new commonjsGlobal.MessageChannel();
      channel.port1.onmessage = nextTick;
      scheduleDrain = function() {
        channel.port2.postMessage(0);
      };
    } else if ("document" in commonjsGlobal && "onreadystatechange" in commonjsGlobal.document.createElement("script")) {
      scheduleDrain = function() {
        var scriptEl = commonjsGlobal.document.createElement("script");
        scriptEl.onreadystatechange = function() {
          nextTick();
          scriptEl.onreadystatechange = null;
          scriptEl.parentNode.removeChild(scriptEl);
          scriptEl = null;
        };
        commonjsGlobal.document.documentElement.appendChild(scriptEl);
      };
    } else {
      scheduleDrain = function() {
        setTimeout(nextTick, 0);
      };
    }
  } else {
    scheduleDrain = function() {
      process.nextTick(nextTick);
    };
  }
  var draining;
  var queue = [];
  function nextTick() {
    draining = true;
    var i, oldQueue;
    var len = queue.length;
    while (len) {
      oldQueue = queue;
      queue = [];
      i = -1;
      while (++i < len) {
        oldQueue[i]();
      }
      len = queue.length;
    }
    draining = false;
  }
  lib$2 = immediate;
  function immediate(task) {
    if (queue.push(task) === 1 && !draining) {
      scheduleDrain();
    }
  }
  return lib$2;
}
var lib$1;
var hasRequiredLib;
function requireLib() {
  if (hasRequiredLib) return lib$1;
  hasRequiredLib = 1;
  var immediate = requireLib$1();
  function INTERNAL() {
  }
  var handlers = {};
  var REJECTED = ["REJECTED"];
  var FULFILLED = ["FULFILLED"];
  var PENDING = ["PENDING"];
  if (!process.browser) {
    var UNHANDLED = ["UNHANDLED"];
  }
  lib$1 = Promise2;
  function Promise2(resolver) {
    if (typeof resolver !== "function") {
      throw new TypeError("resolver must be a function");
    }
    this.state = PENDING;
    this.queue = [];
    this.outcome = void 0;
    if (!process.browser) {
      this.handled = UNHANDLED;
    }
    if (resolver !== INTERNAL) {
      safelyResolveThenable(this, resolver);
    }
  }
  Promise2.prototype.finally = function(callback) {
    if (typeof callback !== "function") {
      return this;
    }
    var p = this.constructor;
    return this.then(resolve2, reject2);
    function resolve2(value) {
      function yes() {
        return value;
      }
      return p.resolve(callback()).then(yes);
    }
    function reject2(reason) {
      function no() {
        throw reason;
      }
      return p.resolve(callback()).then(no);
    }
  };
  Promise2.prototype.catch = function(onRejected) {
    return this.then(null, onRejected);
  };
  Promise2.prototype.then = function(onFulfilled, onRejected) {
    if (typeof onFulfilled !== "function" && this.state === FULFILLED || typeof onRejected !== "function" && this.state === REJECTED) {
      return this;
    }
    var promise = new this.constructor(INTERNAL);
    if (!process.browser) {
      if (this.handled === UNHANDLED) {
        this.handled = null;
      }
    }
    if (this.state !== PENDING) {
      var resolver = this.state === FULFILLED ? onFulfilled : onRejected;
      unwrap(promise, resolver, this.outcome);
    } else {
      this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
    }
    return promise;
  };
  function QueueItem(promise, onFulfilled, onRejected) {
    this.promise = promise;
    if (typeof onFulfilled === "function") {
      this.onFulfilled = onFulfilled;
      this.callFulfilled = this.otherCallFulfilled;
    }
    if (typeof onRejected === "function") {
      this.onRejected = onRejected;
      this.callRejected = this.otherCallRejected;
    }
  }
  QueueItem.prototype.callFulfilled = function(value) {
    handlers.resolve(this.promise, value);
  };
  QueueItem.prototype.otherCallFulfilled = function(value) {
    unwrap(this.promise, this.onFulfilled, value);
  };
  QueueItem.prototype.callRejected = function(value) {
    handlers.reject(this.promise, value);
  };
  QueueItem.prototype.otherCallRejected = function(value) {
    unwrap(this.promise, this.onRejected, value);
  };
  function unwrap(promise, func, value) {
    immediate(function() {
      var returnValue;
      try {
        returnValue = func(value);
      } catch (e2) {
        return handlers.reject(promise, e2);
      }
      if (returnValue === promise) {
        handlers.reject(promise, new TypeError("Cannot resolve promise with itself"));
      } else {
        handlers.resolve(promise, returnValue);
      }
    });
  }
  handlers.resolve = function(self2, value) {
    var result = tryCatch(getThen, value);
    if (result.status === "error") {
      return handlers.reject(self2, result.value);
    }
    var thenable = result.value;
    if (thenable) {
      safelyResolveThenable(self2, thenable);
    } else {
      self2.state = FULFILLED;
      self2.outcome = value;
      var i = -1;
      var len = self2.queue.length;
      while (++i < len) {
        self2.queue[i].callFulfilled(value);
      }
    }
    return self2;
  };
  handlers.reject = function(self2, error2) {
    self2.state = REJECTED;
    self2.outcome = error2;
    if (!process.browser) {
      if (self2.handled === UNHANDLED) {
        immediate(function() {
          if (self2.handled === UNHANDLED) {
            process.emit("unhandledRejection", error2, self2);
          }
        });
      }
    }
    var i = -1;
    var len = self2.queue.length;
    while (++i < len) {
      self2.queue[i].callRejected(error2);
    }
    return self2;
  };
  function getThen(obj) {
    var then = obj && obj.then;
    if (obj && (typeof obj === "object" || typeof obj === "function") && typeof then === "function") {
      return function appyThen() {
        then.apply(obj, arguments);
      };
    }
  }
  function safelyResolveThenable(self2, thenable) {
    var called = false;
    function onError(value) {
      if (called) {
        return;
      }
      called = true;
      handlers.reject(self2, value);
    }
    function onSuccess(value) {
      if (called) {
        return;
      }
      called = true;
      handlers.resolve(self2, value);
    }
    function tryToUnwrap() {
      thenable(onSuccess, onError);
    }
    var result = tryCatch(tryToUnwrap);
    if (result.status === "error") {
      onError(result.value);
    }
  }
  function tryCatch(func, value) {
    var out2 = {};
    try {
      out2.value = func(value);
      out2.status = "success";
    } catch (e2) {
      out2.status = "error";
      out2.value = e2;
    }
    return out2;
  }
  Promise2.resolve = resolve;
  function resolve(value) {
    if (value instanceof this) {
      return value;
    }
    return handlers.resolve(new this(INTERNAL), value);
  }
  Promise2.reject = reject;
  function reject(reason) {
    var promise = new this(INTERNAL);
    return handlers.reject(promise, reason);
  }
  Promise2.all = all;
  function all(iterable) {
    var self2 = this;
    if (Object.prototype.toString.call(iterable) !== "[object Array]") {
      return this.reject(new TypeError("must be an array"));
    }
    var len = iterable.length;
    var called = false;
    if (!len) {
      return this.resolve([]);
    }
    var values = new Array(len);
    var resolved = 0;
    var i = -1;
    var promise = new this(INTERNAL);
    while (++i < len) {
      allResolver(iterable[i], i);
    }
    return promise;
    function allResolver(value, i2) {
      self2.resolve(value).then(resolveFromAll, function(error2) {
        if (!called) {
          called = true;
          handlers.reject(promise, error2);
        }
      });
      function resolveFromAll(outValue) {
        values[i2] = outValue;
        if (++resolved === len && !called) {
          called = true;
          handlers.resolve(promise, values);
        }
      }
    }
  }
  Promise2.race = race;
  function race(iterable) {
    var self2 = this;
    if (Object.prototype.toString.call(iterable) !== "[object Array]") {
      return this.reject(new TypeError("must be an array"));
    }
    var len = iterable.length;
    var called = false;
    if (!len) {
      return this.resolve([]);
    }
    var i = -1;
    var promise = new this(INTERNAL);
    while (++i < len) {
      resolver(iterable[i]);
    }
    return promise;
    function resolver(value) {
      self2.resolve(value).then(function(response) {
        if (!called) {
          called = true;
          handlers.resolve(promise, response);
        }
      }, function(error2) {
        if (!called) {
          called = true;
          handlers.reject(promise, error2);
        }
      });
    }
  }
  return lib$1;
}
var ES6Promise = null;
if (typeof Promise !== "undefined") {
  ES6Promise = Promise;
} else {
  ES6Promise = requireLib();
}
var external$3 = {
  Promise: ES6Promise
};
(function(global2, undefined$1) {
  if (global2.setImmediate) {
    return;
  }
  var nextHandle = 1;
  var tasksByHandle = {};
  var currentlyRunningATask = false;
  var doc = global2.document;
  var registerImmediate;
  function setImmediate2(callback) {
    if (typeof callback !== "function") {
      callback = new Function("" + callback);
    }
    var args = new Array(arguments.length - 1);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i + 1];
    }
    var task = { callback, args };
    tasksByHandle[nextHandle] = task;
    registerImmediate(nextHandle);
    return nextHandle++;
  }
  function clearImmediate(handle) {
    delete tasksByHandle[handle];
  }
  function run(task) {
    var callback = task.callback;
    var args = task.args;
    switch (args.length) {
      case 0:
        callback();
        break;
      case 1:
        callback(args[0]);
        break;
      case 2:
        callback(args[0], args[1]);
        break;
      case 3:
        callback(args[0], args[1], args[2]);
        break;
      default:
        callback.apply(undefined$1, args);
        break;
    }
  }
  function runIfPresent(handle) {
    if (currentlyRunningATask) {
      setTimeout(runIfPresent, 0, handle);
    } else {
      var task = tasksByHandle[handle];
      if (task) {
        currentlyRunningATask = true;
        try {
          run(task);
        } finally {
          clearImmediate(handle);
          currentlyRunningATask = false;
        }
      }
    }
  }
  function installNextTickImplementation() {
    registerImmediate = function(handle) {
      process.nextTick(function() {
        runIfPresent(handle);
      });
    };
  }
  function canUsePostMessage() {
    if (global2.postMessage && !global2.importScripts) {
      var postMessageIsAsynchronous = true;
      var oldOnMessage = global2.onmessage;
      global2.onmessage = function() {
        postMessageIsAsynchronous = false;
      };
      global2.postMessage("", "*");
      global2.onmessage = oldOnMessage;
      return postMessageIsAsynchronous;
    }
  }
  function installPostMessageImplementation() {
    var messagePrefix = "setImmediate$" + Math.random() + "$";
    var onGlobalMessage = function(event) {
      if (event.source === global2 && typeof event.data === "string" && event.data.indexOf(messagePrefix) === 0) {
        runIfPresent(+event.data.slice(messagePrefix.length));
      }
    };
    if (global2.addEventListener) {
      global2.addEventListener("message", onGlobalMessage, false);
    } else {
      global2.attachEvent("onmessage", onGlobalMessage);
    }
    registerImmediate = function(handle) {
      global2.postMessage(messagePrefix + handle, "*");
    };
  }
  function installMessageChannelImplementation() {
    var channel = new MessageChannel();
    channel.port1.onmessage = function(event) {
      var handle = event.data;
      runIfPresent(handle);
    };
    registerImmediate = function(handle) {
      channel.port2.postMessage(handle);
    };
  }
  function installReadyStateChangeImplementation() {
    var html = doc.documentElement;
    registerImmediate = function(handle) {
      var script = doc.createElement("script");
      script.onreadystatechange = function() {
        runIfPresent(handle);
        script.onreadystatechange = null;
        html.removeChild(script);
        script = null;
      };
      html.appendChild(script);
    };
  }
  function installSetTimeoutImplementation() {
    registerImmediate = function(handle) {
      setTimeout(runIfPresent, 0, handle);
    };
  }
  var attachTo = Object.getPrototypeOf && Object.getPrototypeOf(global2);
  attachTo = attachTo && attachTo.setTimeout ? attachTo : global2;
  if ({}.toString.call(global2.process) === "[object process]") {
    installNextTickImplementation();
  } else if (canUsePostMessage()) {
    installPostMessageImplementation();
  } else if (global2.MessageChannel) {
    installMessageChannelImplementation();
  } else if (doc && "onreadystatechange" in doc.createElement("script")) {
    installReadyStateChangeImplementation();
  } else {
    installSetTimeoutImplementation();
  }
  attachTo.setImmediate = setImmediate2;
  attachTo.clearImmediate = clearImmediate;
})(typeof self === "undefined" ? typeof commonjsGlobal === "undefined" ? commonjsGlobal : commonjsGlobal : self);
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils$q;
  hasRequiredUtils = 1;
  (function(exports) {
    var support2 = support$4;
    var base642 = requireBase64();
    var nodejsUtils2 = nodejsUtils$2;
    var external2 = external$3;
    function string2binary(str) {
      var result = null;
      if (support2.uint8array) {
        result = new Uint8Array(str.length);
      } else {
        result = new Array(str.length);
      }
      return stringToArrayLike(str, result);
    }
    exports.newBlob = function(part, type) {
      exports.checkSupport("blob");
      try {
        return new Blob([part], {
          type
        });
      } catch (e2) {
        try {
          var Builder = self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder;
          var builder = new Builder();
          builder.append(part);
          return builder.getBlob(type);
        } catch (e3) {
          throw new Error("Bug : can't construct the Blob.");
        }
      }
    };
    function identity(input) {
      return input;
    }
    function stringToArrayLike(str, array) {
      for (var i = 0; i < str.length; ++i) {
        array[i] = str.charCodeAt(i) & 255;
      }
      return array;
    }
    var arrayToStringHelper = {
      /**
       * Transform an array of int into a string, chunk by chunk.
       * See the performances notes on arrayLikeToString.
       * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
       * @param {String} type the type of the array.
       * @param {Integer} chunk the chunk size.
       * @return {String} the resulting string.
       * @throws Error if the chunk is too big for the stack.
       */
      stringifyByChunk: function(array, type, chunk) {
        var result = [], k = 0, len = array.length;
        if (len <= chunk) {
          return String.fromCharCode.apply(null, array);
        }
        while (k < len) {
          if (type === "array" || type === "nodebuffer") {
            result.push(String.fromCharCode.apply(null, array.slice(k, Math.min(k + chunk, len))));
          } else {
            result.push(String.fromCharCode.apply(null, array.subarray(k, Math.min(k + chunk, len))));
          }
          k += chunk;
        }
        return result.join("");
      },
      /**
       * Call String.fromCharCode on every item in the array.
       * This is the naive implementation, which generate A LOT of intermediate string.
       * This should be used when everything else fail.
       * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
       * @return {String} the result.
       */
      stringifyByChar: function(array) {
        var resultStr = "";
        for (var i = 0; i < array.length; i++) {
          resultStr += String.fromCharCode(array[i]);
        }
        return resultStr;
      },
      applyCanBeUsed: {
        /**
         * true if the browser accepts to use String.fromCharCode on Uint8Array
         */
        uint8array: function() {
          try {
            return support2.uint8array && String.fromCharCode.apply(null, new Uint8Array(1)).length === 1;
          } catch (e2) {
            return false;
          }
        }(),
        /**
         * true if the browser accepts to use String.fromCharCode on nodejs Buffer.
         */
        nodebuffer: function() {
          try {
            return support2.nodebuffer && String.fromCharCode.apply(null, nodejsUtils2.allocBuffer(1)).length === 1;
          } catch (e2) {
            return false;
          }
        }()
      }
    };
    function arrayLikeToString(array) {
      var chunk = 65536, type = exports.getTypeOf(array), canUseApply = true;
      if (type === "uint8array") {
        canUseApply = arrayToStringHelper.applyCanBeUsed.uint8array;
      } else if (type === "nodebuffer") {
        canUseApply = arrayToStringHelper.applyCanBeUsed.nodebuffer;
      }
      if (canUseApply) {
        while (chunk > 1) {
          try {
            return arrayToStringHelper.stringifyByChunk(array, type, chunk);
          } catch (e2) {
            chunk = Math.floor(chunk / 2);
          }
        }
      }
      return arrayToStringHelper.stringifyByChar(array);
    }
    exports.applyFromCharCode = arrayLikeToString;
    function arrayLikeToArrayLike(arrayFrom, arrayTo) {
      for (var i = 0; i < arrayFrom.length; i++) {
        arrayTo[i] = arrayFrom[i];
      }
      return arrayTo;
    }
    var transform = {};
    transform["string"] = {
      "string": identity,
      "array": function(input) {
        return stringToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return transform["string"]["uint8array"](input).buffer;
      },
      "uint8array": function(input) {
        return stringToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": function(input) {
        return stringToArrayLike(input, nodejsUtils2.allocBuffer(input.length));
      }
    };
    transform["array"] = {
      "string": arrayLikeToString,
      "array": identity,
      "arraybuffer": function(input) {
        return new Uint8Array(input).buffer;
      },
      "uint8array": function(input) {
        return new Uint8Array(input);
      },
      "nodebuffer": function(input) {
        return nodejsUtils2.newBufferFrom(input);
      }
    };
    transform["arraybuffer"] = {
      "string": function(input) {
        return arrayLikeToString(new Uint8Array(input));
      },
      "array": function(input) {
        return arrayLikeToArrayLike(new Uint8Array(input), new Array(input.byteLength));
      },
      "arraybuffer": identity,
      "uint8array": function(input) {
        return new Uint8Array(input);
      },
      "nodebuffer": function(input) {
        return nodejsUtils2.newBufferFrom(new Uint8Array(input));
      }
    };
    transform["uint8array"] = {
      "string": arrayLikeToString,
      "array": function(input) {
        return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return input.buffer;
      },
      "uint8array": identity,
      "nodebuffer": function(input) {
        return nodejsUtils2.newBufferFrom(input);
      }
    };
    transform["nodebuffer"] = {
      "string": arrayLikeToString,
      "array": function(input) {
        return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return transform["nodebuffer"]["uint8array"](input).buffer;
      },
      "uint8array": function(input) {
        return arrayLikeToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": identity
    };
    exports.transformTo = function(outputType, input) {
      if (!input) {
        input = "";
      }
      if (!outputType) {
        return input;
      }
      exports.checkSupport(outputType);
      var inputType = exports.getTypeOf(input);
      var result = transform[inputType][outputType](input);
      return result;
    };
    exports.resolve = function(path) {
      var parts = path.split("/");
      var result = [];
      for (var index2 = 0; index2 < parts.length; index2++) {
        var part = parts[index2];
        if (part === "." || part === "" && index2 !== 0 && index2 !== parts.length - 1) {
          continue;
        } else if (part === "..") {
          result.pop();
        } else {
          result.push(part);
        }
      }
      return result.join("/");
    };
    exports.getTypeOf = function(input) {
      if (typeof input === "string") {
        return "string";
      }
      if (Object.prototype.toString.call(input) === "[object Array]") {
        return "array";
      }
      if (support2.nodebuffer && nodejsUtils2.isBuffer(input)) {
        return "nodebuffer";
      }
      if (support2.uint8array && input instanceof Uint8Array) {
        return "uint8array";
      }
      if (support2.arraybuffer && input instanceof ArrayBuffer) {
        return "arraybuffer";
      }
    };
    exports.checkSupport = function(type) {
      var supported = support2[type.toLowerCase()];
      if (!supported) {
        throw new Error(type + " is not supported by this platform");
      }
    };
    exports.MAX_VALUE_16BITS = 65535;
    exports.MAX_VALUE_32BITS = -1;
    exports.pretty = function(str) {
      var res = "", code, i;
      for (i = 0; i < (str || "").length; i++) {
        code = str.charCodeAt(i);
        res += "\\x" + (code < 16 ? "0" : "") + code.toString(16).toUpperCase();
      }
      return res;
    };
    exports.delay = function(callback, args, self2) {
      setImmediate(function() {
        callback.apply(self2 || null, args || []);
      });
    };
    exports.inherits = function(ctor, superCtor) {
      var Obj = function() {
      };
      Obj.prototype = superCtor.prototype;
      ctor.prototype = new Obj();
    };
    exports.extend = function() {
      var result = {}, i, attr;
      for (i = 0; i < arguments.length; i++) {
        for (attr in arguments[i]) {
          if (Object.prototype.hasOwnProperty.call(arguments[i], attr) && typeof result[attr] === "undefined") {
            result[attr] = arguments[i][attr];
          }
        }
      }
      return result;
    };
    exports.prepareContent = function(name, inputData, isBinary, isOptimizedBinaryString, isBase64) {
      var promise = external2.Promise.resolve(inputData).then(function(data) {
        var isBlob = support2.blob && (data instanceof Blob || ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(data)) !== -1);
        if (isBlob && typeof FileReader !== "undefined") {
          return new external2.Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e2) {
              resolve(e2.target.result);
            };
            reader.onerror = function(e2) {
              reject(e2.target.error);
            };
            reader.readAsArrayBuffer(data);
          });
        } else {
          return data;
        }
      });
      return promise.then(function(data) {
        var dataType = exports.getTypeOf(data);
        if (!dataType) {
          return external2.Promise.reject(
            new Error("Can't read the data of '" + name + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?")
          );
        }
        if (dataType === "arraybuffer") {
          data = exports.transformTo("uint8array", data);
        } else if (dataType === "string") {
          if (isBase64) {
            data = base642.decode(data);
          } else if (isBinary) {
            if (isOptimizedBinaryString !== true) {
              data = string2binary(data);
            }
          }
        }
        return data;
      });
    };
  })(utils$q);
  return utils$q;
}
function GenericWorker$b(name) {
  this.name = name || "default";
  this.streamInfo = {};
  this.generatedError = null;
  this.extraStreamInfo = {};
  this.isPaused = true;
  this.isFinished = false;
  this.isLocked = false;
  this._listeners = {
    "data": [],
    "end": [],
    "error": []
  };
  this.previous = null;
}
GenericWorker$b.prototype = {
  /**
   * Push a chunk to the next workers.
   * @param {Object} chunk the chunk to push
   */
  push: function(chunk) {
    this.emit("data", chunk);
  },
  /**
   * End the stream.
   * @return {Boolean} true if this call ended the worker, false otherwise.
   */
  end: function() {
    if (this.isFinished) {
      return false;
    }
    this.flush();
    try {
      this.emit("end");
      this.cleanUp();
      this.isFinished = true;
    } catch (e2) {
      this.emit("error", e2);
    }
    return true;
  },
  /**
   * End the stream with an error.
   * @param {Error} e the error which caused the premature end.
   * @return {Boolean} true if this call ended the worker with an error, false otherwise.
   */
  error: function(e2) {
    if (this.isFinished) {
      return false;
    }
    if (this.isPaused) {
      this.generatedError = e2;
    } else {
      this.isFinished = true;
      this.emit("error", e2);
      if (this.previous) {
        this.previous.error(e2);
      }
      this.cleanUp();
    }
    return true;
  },
  /**
   * Add a callback on an event.
   * @param {String} name the name of the event (data, end, error)
   * @param {Function} listener the function to call when the event is triggered
   * @return {GenericWorker} the current object for chainability
   */
  on: function(name, listener) {
    this._listeners[name].push(listener);
    return this;
  },
  /**
   * Clean any references when a worker is ending.
   */
  cleanUp: function() {
    this.streamInfo = this.generatedError = this.extraStreamInfo = null;
    this._listeners = [];
  },
  /**
   * Trigger an event. This will call registered callback with the provided arg.
   * @param {String} name the name of the event (data, end, error)
   * @param {Object} arg the argument to call the callback with.
   */
  emit: function(name, arg) {
    if (this._listeners[name]) {
      for (var i = 0; i < this._listeners[name].length; i++) {
        this._listeners[name][i].call(this, arg);
      }
    }
  },
  /**
   * Chain a worker with an other.
   * @param {Worker} next the worker receiving events from the current one.
   * @return {worker} the next worker for chainability
   */
  pipe: function(next) {
    return next.registerPrevious(this);
  },
  /**
   * Same as `pipe` in the other direction.
   * Using an API with `pipe(next)` is very easy.
   * Implementing the API with the point of view of the next one registering
   * a source is easier, see the ZipFileWorker.
   * @param {Worker} previous the previous worker, sending events to this one
   * @return {Worker} the current worker for chainability
   */
  registerPrevious: function(previous) {
    if (this.isLocked) {
      throw new Error("The stream '" + this + "' has already been used.");
    }
    this.streamInfo = previous.streamInfo;
    this.mergeStreamInfo();
    this.previous = previous;
    var self2 = this;
    previous.on("data", function(chunk) {
      self2.processChunk(chunk);
    });
    previous.on("end", function() {
      self2.end();
    });
    previous.on("error", function(e2) {
      self2.error(e2);
    });
    return this;
  },
  /**
   * Pause the stream so it doesn't send events anymore.
   * @return {Boolean} true if this call paused the worker, false otherwise.
   */
  pause: function() {
    if (this.isPaused || this.isFinished) {
      return false;
    }
    this.isPaused = true;
    if (this.previous) {
      this.previous.pause();
    }
    return true;
  },
  /**
   * Resume a paused stream.
   * @return {Boolean} true if this call resumed the worker, false otherwise.
   */
  resume: function() {
    if (!this.isPaused || this.isFinished) {
      return false;
    }
    this.isPaused = false;
    var withError = false;
    if (this.generatedError) {
      this.error(this.generatedError);
      withError = true;
    }
    if (this.previous) {
      this.previous.resume();
    }
    return !withError;
  },
  /**
   * Flush any remaining bytes as the stream is ending.
   */
  flush: function() {
  },
  /**
   * Process a chunk. This is usually the method overridden.
   * @param {Object} chunk the chunk to process.
   */
  processChunk: function(chunk) {
    this.push(chunk);
  },
  /**
   * Add a key/value to be added in the workers chain streamInfo once activated.
   * @param {String} key the key to use
   * @param {Object} value the associated value
   * @return {Worker} the current worker for chainability
   */
  withStreamInfo: function(key, value) {
    this.extraStreamInfo[key] = value;
    this.mergeStreamInfo();
    return this;
  },
  /**
   * Merge this worker's streamInfo into the chain's streamInfo.
   */
  mergeStreamInfo: function() {
    for (var key in this.extraStreamInfo) {
      if (!Object.prototype.hasOwnProperty.call(this.extraStreamInfo, key)) {
        continue;
      }
      this.streamInfo[key] = this.extraStreamInfo[key];
    }
  },
  /**
   * Lock the stream to prevent further updates on the workers chain.
   * After calling this method, all calls to pipe will fail.
   */
  lock: function() {
    if (this.isLocked) {
      throw new Error("The stream '" + this + "' has already been used.");
    }
    this.isLocked = true;
    if (this.previous) {
      this.previous.lock();
    }
  },
  /**
   *
   * Pretty print the workers chain.
   */
  toString: function() {
    var me = "Worker " + this.name;
    if (this.previous) {
      return this.previous + " -> " + me;
    } else {
      return me;
    }
  }
};
var GenericWorker_1 = GenericWorker$b;
(function(exports) {
  var utils2 = requireUtils();
  var support2 = support$4;
  var nodejsUtils2 = nodejsUtils$2;
  var GenericWorker2 = GenericWorker_1;
  var _utf8len2 = new Array(256);
  for (var i = 0; i < 256; i++) {
    _utf8len2[i] = i >= 252 ? 6 : i >= 248 ? 5 : i >= 240 ? 4 : i >= 224 ? 3 : i >= 192 ? 2 : 1;
  }
  _utf8len2[254] = _utf8len2[254] = 1;
  var string2buf = function(str) {
    var buf, c2, c22, m_pos, i2, str_len = str.length, buf_len = 0;
    for (m_pos = 0; m_pos < str_len; m_pos++) {
      c2 = str.charCodeAt(m_pos);
      if ((c2 & 64512) === 55296 && m_pos + 1 < str_len) {
        c22 = str.charCodeAt(m_pos + 1);
        if ((c22 & 64512) === 56320) {
          c2 = 65536 + (c2 - 55296 << 10) + (c22 - 56320);
          m_pos++;
        }
      }
      buf_len += c2 < 128 ? 1 : c2 < 2048 ? 2 : c2 < 65536 ? 3 : 4;
    }
    if (support2.uint8array) {
      buf = new Uint8Array(buf_len);
    } else {
      buf = new Array(buf_len);
    }
    for (i2 = 0, m_pos = 0; i2 < buf_len; m_pos++) {
      c2 = str.charCodeAt(m_pos);
      if ((c2 & 64512) === 55296 && m_pos + 1 < str_len) {
        c22 = str.charCodeAt(m_pos + 1);
        if ((c22 & 64512) === 56320) {
          c2 = 65536 + (c2 - 55296 << 10) + (c22 - 56320);
          m_pos++;
        }
      }
      if (c2 < 128) {
        buf[i2++] = c2;
      } else if (c2 < 2048) {
        buf[i2++] = 192 | c2 >>> 6;
        buf[i2++] = 128 | c2 & 63;
      } else if (c2 < 65536) {
        buf[i2++] = 224 | c2 >>> 12;
        buf[i2++] = 128 | c2 >>> 6 & 63;
        buf[i2++] = 128 | c2 & 63;
      } else {
        buf[i2++] = 240 | c2 >>> 18;
        buf[i2++] = 128 | c2 >>> 12 & 63;
        buf[i2++] = 128 | c2 >>> 6 & 63;
        buf[i2++] = 128 | c2 & 63;
      }
    }
    return buf;
  };
  var utf8border = function(buf, max) {
    var pos;
    max = max || buf.length;
    if (max > buf.length) {
      max = buf.length;
    }
    pos = max - 1;
    while (pos >= 0 && (buf[pos] & 192) === 128) {
      pos--;
    }
    if (pos < 0) {
      return max;
    }
    if (pos === 0) {
      return max;
    }
    return pos + _utf8len2[buf[pos]] > max ? pos : max;
  };
  var buf2string = function(buf) {
    var i2, out2, c2, c_len;
    var len = buf.length;
    var utf16buf = new Array(len * 2);
    for (out2 = 0, i2 = 0; i2 < len; ) {
      c2 = buf[i2++];
      if (c2 < 128) {
        utf16buf[out2++] = c2;
        continue;
      }
      c_len = _utf8len2[c2];
      if (c_len > 4) {
        utf16buf[out2++] = 65533;
        i2 += c_len - 1;
        continue;
      }
      c2 &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
      while (c_len > 1 && i2 < len) {
        c2 = c2 << 6 | buf[i2++] & 63;
        c_len--;
      }
      if (c_len > 1) {
        utf16buf[out2++] = 65533;
        continue;
      }
      if (c2 < 65536) {
        utf16buf[out2++] = c2;
      } else {
        c2 -= 65536;
        utf16buf[out2++] = 55296 | c2 >> 10 & 1023;
        utf16buf[out2++] = 56320 | c2 & 1023;
      }
    }
    if (utf16buf.length !== out2) {
      if (utf16buf.subarray) {
        utf16buf = utf16buf.subarray(0, out2);
      } else {
        utf16buf.length = out2;
      }
    }
    return utils2.applyFromCharCode(utf16buf);
  };
  exports.utf8encode = function utf8encode(str) {
    if (support2.nodebuffer) {
      return nodejsUtils2.newBufferFrom(str, "utf-8");
    }
    return string2buf(str);
  };
  exports.utf8decode = function utf8decode(buf) {
    if (support2.nodebuffer) {
      return utils2.transformTo("nodebuffer", buf).toString("utf-8");
    }
    buf = utils2.transformTo(support2.uint8array ? "uint8array" : "array", buf);
    return buf2string(buf);
  };
  function Utf8DecodeWorker() {
    GenericWorker2.call(this, "utf-8 decode");
    this.leftOver = null;
  }
  utils2.inherits(Utf8DecodeWorker, GenericWorker2);
  Utf8DecodeWorker.prototype.processChunk = function(chunk) {
    var data = utils2.transformTo(support2.uint8array ? "uint8array" : "array", chunk.data);
    if (this.leftOver && this.leftOver.length) {
      if (support2.uint8array) {
        var previousData = data;
        data = new Uint8Array(previousData.length + this.leftOver.length);
        data.set(this.leftOver, 0);
        data.set(previousData, this.leftOver.length);
      } else {
        data = this.leftOver.concat(data);
      }
      this.leftOver = null;
    }
    var nextBoundary = utf8border(data);
    var usableData = data;
    if (nextBoundary !== data.length) {
      if (support2.uint8array) {
        usableData = data.subarray(0, nextBoundary);
        this.leftOver = data.subarray(nextBoundary, data.length);
      } else {
        usableData = data.slice(0, nextBoundary);
        this.leftOver = data.slice(nextBoundary, data.length);
      }
    }
    this.push({
      data: exports.utf8decode(usableData),
      meta: chunk.meta
    });
  };
  Utf8DecodeWorker.prototype.flush = function() {
    if (this.leftOver && this.leftOver.length) {
      this.push({
        data: exports.utf8decode(this.leftOver),
        meta: {}
      });
      this.leftOver = null;
    }
  };
  exports.Utf8DecodeWorker = Utf8DecodeWorker;
  function Utf8EncodeWorker() {
    GenericWorker2.call(this, "utf-8 encode");
  }
  utils2.inherits(Utf8EncodeWorker, GenericWorker2);
  Utf8EncodeWorker.prototype.processChunk = function(chunk) {
    this.push({
      data: exports.utf8encode(chunk.data),
      meta: chunk.meta
    });
  };
  exports.Utf8EncodeWorker = Utf8EncodeWorker;
})(utf8$5);
var GenericWorker$a = GenericWorker_1;
var utils$p = requireUtils();
function ConvertWorker$1(destType) {
  GenericWorker$a.call(this, "ConvertWorker to " + destType);
  this.destType = destType;
}
utils$p.inherits(ConvertWorker$1, GenericWorker$a);
ConvertWorker$1.prototype.processChunk = function(chunk) {
  this.push({
    data: utils$p.transformTo(this.destType, chunk.data),
    meta: chunk.meta
  });
};
var ConvertWorker_1 = ConvertWorker$1;
var NodejsStreamOutputAdapter_1;
var hasRequiredNodejsStreamOutputAdapter;
function requireNodejsStreamOutputAdapter() {
  if (hasRequiredNodejsStreamOutputAdapter) return NodejsStreamOutputAdapter_1;
  hasRequiredNodejsStreamOutputAdapter = 1;
  var Readable = requireReadable().Readable;
  var utils2 = requireUtils();
  utils2.inherits(NodejsStreamOutputAdapter2, Readable);
  function NodejsStreamOutputAdapter2(helper, options, updateCb) {
    Readable.call(this, options);
    this._helper = helper;
    var self2 = this;
    helper.on("data", function(data, meta) {
      if (!self2.push(data)) {
        self2._helper.pause();
      }
      if (updateCb) {
        updateCb(meta);
      }
    }).on("error", function(e2) {
      self2.emit("error", e2);
    }).on("end", function() {
      self2.push(null);
    });
  }
  NodejsStreamOutputAdapter2.prototype._read = function() {
    this._helper.resume();
  };
  NodejsStreamOutputAdapter_1 = NodejsStreamOutputAdapter2;
  return NodejsStreamOutputAdapter_1;
}
var utils$o = requireUtils();
var ConvertWorker = ConvertWorker_1;
var GenericWorker$9 = GenericWorker_1;
var base64 = requireBase64();
var support$3 = support$4;
var external$2 = external$3;
var NodejsStreamOutputAdapter = null;
if (support$3.nodestream) {
  try {
    NodejsStreamOutputAdapter = requireNodejsStreamOutputAdapter();
  } catch (e2) {
  }
}
function transformZipOutput(type, content, mimeType) {
  switch (type) {
    case "blob":
      return utils$o.newBlob(utils$o.transformTo("arraybuffer", content), mimeType);
    case "base64":
      return base64.encode(content);
    default:
      return utils$o.transformTo(type, content);
  }
}
function concat(type, dataArray) {
  var i, index2 = 0, res = null, totalLength = 0;
  for (i = 0; i < dataArray.length; i++) {
    totalLength += dataArray[i].length;
  }
  switch (type) {
    case "string":
      return dataArray.join("");
    case "array":
      return Array.prototype.concat.apply([], dataArray);
    case "uint8array":
      res = new Uint8Array(totalLength);
      for (i = 0; i < dataArray.length; i++) {
        res.set(dataArray[i], index2);
        index2 += dataArray[i].length;
      }
      return res;
    case "nodebuffer":
      return Buffer.concat(dataArray);
    default:
      throw new Error("concat : unsupported type '" + type + "'");
  }
}
function accumulate(helper, updateCallback) {
  return new external$2.Promise(function(resolve, reject) {
    var dataArray = [];
    var chunkType = helper._internalType, resultType = helper._outputType, mimeType = helper._mimeType;
    helper.on("data", function(data, meta) {
      dataArray.push(data);
      if (updateCallback) {
        updateCallback(meta);
      }
    }).on("error", function(err2) {
      dataArray = [];
      reject(err2);
    }).on("end", function() {
      try {
        var result = transformZipOutput(resultType, concat(chunkType, dataArray), mimeType);
        resolve(result);
      } catch (e2) {
        reject(e2);
      }
      dataArray = [];
    }).resume();
  });
}
function StreamHelper$2(worker, outputType, mimeType) {
  var internalType = outputType;
  switch (outputType) {
    case "blob":
    case "arraybuffer":
      internalType = "uint8array";
      break;
    case "base64":
      internalType = "string";
      break;
  }
  try {
    this._internalType = internalType;
    this._outputType = outputType;
    this._mimeType = mimeType;
    utils$o.checkSupport(internalType);
    this._worker = worker.pipe(new ConvertWorker(internalType));
    worker.lock();
  } catch (e2) {
    this._worker = new GenericWorker$9("error");
    this._worker.error(e2);
  }
}
StreamHelper$2.prototype = {
  /**
   * Listen a StreamHelper, accumulate its content and concatenate it into a
   * complete block.
   * @param {Function} updateCb the update callback.
   * @return Promise the promise for the accumulation.
   */
  accumulate: function(updateCb) {
    return accumulate(this, updateCb);
  },
  /**
   * Add a listener on an event triggered on a stream.
   * @param {String} evt the name of the event
   * @param {Function} fn the listener
   * @return {StreamHelper} the current helper.
   */
  on: function(evt, fn) {
    var self2 = this;
    if (evt === "data") {
      this._worker.on(evt, function(chunk) {
        fn.call(self2, chunk.data, chunk.meta);
      });
    } else {
      this._worker.on(evt, function() {
        utils$o.delay(fn, arguments, self2);
      });
    }
    return this;
  },
  /**
   * Resume the flow of chunks.
   * @return {StreamHelper} the current helper.
   */
  resume: function() {
    utils$o.delay(this._worker.resume, [], this._worker);
    return this;
  },
  /**
   * Pause the flow of chunks.
   * @return {StreamHelper} the current helper.
   */
  pause: function() {
    this._worker.pause();
    return this;
  },
  /**
   * Return a nodejs stream for this helper.
   * @param {Function} updateCb the update callback.
   * @return {NodejsStreamOutputAdapter} the nodejs stream.
   */
  toNodejsStream: function(updateCb) {
    utils$o.checkSupport("nodestream");
    if (this._outputType !== "nodebuffer") {
      throw new Error(this._outputType + " is not supported by this method");
    }
    return new NodejsStreamOutputAdapter(this, {
      objectMode: this._outputType !== "nodebuffer"
    }, updateCb);
  }
};
var StreamHelper_1 = StreamHelper$2;
var defaults$1 = {};
defaults$1.base64 = false;
defaults$1.binary = false;
defaults$1.dir = false;
defaults$1.createFolders = true;
defaults$1.date = null;
defaults$1.compression = null;
defaults$1.compressionOptions = null;
defaults$1.comment = null;
defaults$1.unixPermissions = null;
defaults$1.dosPermissions = null;
var utils$n = requireUtils();
var GenericWorker$8 = GenericWorker_1;
var DEFAULT_BLOCK_SIZE = 16 * 1024;
function DataWorker$2(dataP) {
  GenericWorker$8.call(this, "DataWorker");
  var self2 = this;
  this.dataIsReady = false;
  this.index = 0;
  this.max = 0;
  this.data = null;
  this.type = "";
  this._tickScheduled = false;
  dataP.then(function(data) {
    self2.dataIsReady = true;
    self2.data = data;
    self2.max = data && data.length || 0;
    self2.type = utils$n.getTypeOf(data);
    if (!self2.isPaused) {
      self2._tickAndRepeat();
    }
  }, function(e2) {
    self2.error(e2);
  });
}
utils$n.inherits(DataWorker$2, GenericWorker$8);
DataWorker$2.prototype.cleanUp = function() {
  GenericWorker$8.prototype.cleanUp.call(this);
  this.data = null;
};
DataWorker$2.prototype.resume = function() {
  if (!GenericWorker$8.prototype.resume.call(this)) {
    return false;
  }
  if (!this._tickScheduled && this.dataIsReady) {
    this._tickScheduled = true;
    utils$n.delay(this._tickAndRepeat, [], this);
  }
  return true;
};
DataWorker$2.prototype._tickAndRepeat = function() {
  this._tickScheduled = false;
  if (this.isPaused || this.isFinished) {
    return;
  }
  this._tick();
  if (!this.isFinished) {
    utils$n.delay(this._tickAndRepeat, [], this);
    this._tickScheduled = true;
  }
};
DataWorker$2.prototype._tick = function() {
  if (this.isPaused || this.isFinished) {
    return false;
  }
  var size = DEFAULT_BLOCK_SIZE;
  var data = null, nextIndex = Math.min(this.max, this.index + size);
  if (this.index >= this.max) {
    return this.end();
  } else {
    switch (this.type) {
      case "string":
        data = this.data.substring(this.index, nextIndex);
        break;
      case "uint8array":
        data = this.data.subarray(this.index, nextIndex);
        break;
      case "array":
      case "nodebuffer":
        data = this.data.slice(this.index, nextIndex);
        break;
    }
    this.index = nextIndex;
    return this.push({
      data,
      meta: {
        percent: this.max ? this.index / this.max * 100 : 0
      }
    });
  }
};
var DataWorker_1 = DataWorker$2;
var utils$m = requireUtils();
function makeTable$1() {
  var c2, table = [];
  for (var n2 = 0; n2 < 256; n2++) {
    c2 = n2;
    for (var k = 0; k < 8; k++) {
      c2 = c2 & 1 ? 3988292384 ^ c2 >>> 1 : c2 >>> 1;
    }
    table[n2] = c2;
  }
  return table;
}
var crcTable$1 = makeTable$1();
function crc32$5(crc, buf, len, pos) {
  var t2 = crcTable$1, end = pos + len;
  crc = crc ^ -1;
  for (var i = pos; i < end; i++) {
    crc = crc >>> 8 ^ t2[(crc ^ buf[i]) & 255];
  }
  return crc ^ -1;
}
function crc32str(crc, str, len, pos) {
  var t2 = crcTable$1, end = pos + len;
  crc = crc ^ -1;
  for (var i = pos; i < end; i++) {
    crc = crc >>> 8 ^ t2[(crc ^ str.charCodeAt(i)) & 255];
  }
  return crc ^ -1;
}
var crc32_1$1 = function crc32wrapper(input, crc) {
  if (typeof input === "undefined" || !input.length) {
    return 0;
  }
  var isArray = utils$m.getTypeOf(input) !== "string";
  if (isArray) {
    return crc32$5(crc | 0, input, input.length, 0);
  } else {
    return crc32str(crc | 0, input, input.length, 0);
  }
};
var GenericWorker$7 = GenericWorker_1;
var crc32$4 = crc32_1$1;
var utils$l = requireUtils();
function Crc32Probe$2() {
  GenericWorker$7.call(this, "Crc32Probe");
  this.withStreamInfo("crc32", 0);
}
utils$l.inherits(Crc32Probe$2, GenericWorker$7);
Crc32Probe$2.prototype.processChunk = function(chunk) {
  this.streamInfo.crc32 = crc32$4(chunk.data, this.streamInfo.crc32 || 0);
  this.push(chunk);
};
var Crc32Probe_1 = Crc32Probe$2;
var utils$k = requireUtils();
var GenericWorker$6 = GenericWorker_1;
function DataLengthProbe$1(propName) {
  GenericWorker$6.call(this, "DataLengthProbe for " + propName);
  this.propName = propName;
  this.withStreamInfo(propName, 0);
}
utils$k.inherits(DataLengthProbe$1, GenericWorker$6);
DataLengthProbe$1.prototype.processChunk = function(chunk) {
  if (chunk) {
    var length = this.streamInfo[this.propName] || 0;
    this.streamInfo[this.propName] = length + chunk.data.length;
  }
  GenericWorker$6.prototype.processChunk.call(this, chunk);
};
var DataLengthProbe_1 = DataLengthProbe$1;
var external$1 = external$3;
var DataWorker$1 = DataWorker_1;
var Crc32Probe$1 = Crc32Probe_1;
var DataLengthProbe = DataLengthProbe_1;
function CompressedObject$3(compressedSize, uncompressedSize, crc322, compression, data) {
  this.compressedSize = compressedSize;
  this.uncompressedSize = uncompressedSize;
  this.crc32 = crc322;
  this.compression = compression;
  this.compressedContent = data;
}
CompressedObject$3.prototype = {
  /**
   * Create a worker to get the uncompressed content.
   * @return {GenericWorker} the worker.
   */
  getContentWorker: function() {
    var worker = new DataWorker$1(external$1.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new DataLengthProbe("data_length"));
    var that = this;
    worker.on("end", function() {
      if (this.streamInfo["data_length"] !== that.uncompressedSize) {
        throw new Error("Bug : uncompressed data size mismatch");
      }
    });
    return worker;
  },
  /**
   * Create a worker to get the compressed content.
   * @return {GenericWorker} the worker.
   */
  getCompressedWorker: function() {
    return new DataWorker$1(external$1.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
  }
};
CompressedObject$3.createWorkerFrom = function(uncompressedWorker, compression, compressionOptions) {
  return uncompressedWorker.pipe(new Crc32Probe$1()).pipe(new DataLengthProbe("uncompressedSize")).pipe(compression.compressWorker(compressionOptions)).pipe(new DataLengthProbe("compressedSize")).withStreamInfo("compression", compression);
};
var compressedObject = CompressedObject$3;
var StreamHelper$1 = StreamHelper_1;
var DataWorker = DataWorker_1;
var utf8$4 = utf8$5;
var CompressedObject$2 = compressedObject;
var GenericWorker$5 = GenericWorker_1;
var ZipObject$1 = function(name, data, options) {
  this.name = name;
  this.dir = options.dir;
  this.date = options.date;
  this.comment = options.comment;
  this.unixPermissions = options.unixPermissions;
  this.dosPermissions = options.dosPermissions;
  this._data = data;
  this._dataBinary = options.binary;
  this.options = {
    compression: options.compression,
    compressionOptions: options.compressionOptions
  };
};
ZipObject$1.prototype = {
  /**
   * Create an internal stream for the content of this object.
   * @param {String} type the type of each chunk.
   * @return StreamHelper the stream.
   */
  internalStream: function(type) {
    var result = null, outputType = "string";
    try {
      if (!type) {
        throw new Error("No output type specified.");
      }
      outputType = type.toLowerCase();
      var askUnicodeString = outputType === "string" || outputType === "text";
      if (outputType === "binarystring" || outputType === "text") {
        outputType = "string";
      }
      result = this._decompressWorker();
      var isUnicodeString = !this._dataBinary;
      if (isUnicodeString && !askUnicodeString) {
        result = result.pipe(new utf8$4.Utf8EncodeWorker());
      }
      if (!isUnicodeString && askUnicodeString) {
        result = result.pipe(new utf8$4.Utf8DecodeWorker());
      }
    } catch (e2) {
      result = new GenericWorker$5("error");
      result.error(e2);
    }
    return new StreamHelper$1(result, outputType, "");
  },
  /**
   * Prepare the content in the asked type.
   * @param {String} type the type of the result.
   * @param {Function} onUpdate a function to call on each internal update.
   * @return Promise the promise of the result.
   */
  async: function(type, onUpdate) {
    return this.internalStream(type).accumulate(onUpdate);
  },
  /**
   * Prepare the content as a nodejs stream.
   * @param {String} type the type of each chunk.
   * @param {Function} onUpdate a function to call on each internal update.
   * @return Stream the stream.
   */
  nodeStream: function(type, onUpdate) {
    return this.internalStream(type || "nodebuffer").toNodejsStream(onUpdate);
  },
  /**
   * Return a worker for the compressed content.
   * @private
   * @param {Object} compression the compression object to use.
   * @param {Object} compressionOptions the options to use when compressing.
   * @return Worker the worker.
   */
  _compressWorker: function(compression, compressionOptions) {
    if (this._data instanceof CompressedObject$2 && this._data.compression.magic === compression.magic) {
      return this._data.getCompressedWorker();
    } else {
      var result = this._decompressWorker();
      if (!this._dataBinary) {
        result = result.pipe(new utf8$4.Utf8EncodeWorker());
      }
      return CompressedObject$2.createWorkerFrom(result, compression, compressionOptions);
    }
  },
  /**
   * Return a worker for the decompressed content.
   * @private
   * @return Worker the worker.
   */
  _decompressWorker: function() {
    if (this._data instanceof CompressedObject$2) {
      return this._data.getContentWorker();
    } else if (this._data instanceof GenericWorker$5) {
      return this._data;
    } else {
      return new DataWorker(this._data);
    }
  }
};
var removedMethods = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"];
var removedFn = function() {
  throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
};
for (var i = 0; i < removedMethods.length; i++) {
  ZipObject$1.prototype[removedMethods[i]] = removedFn;
}
var zipObject = ZipObject$1;
var generate$1 = {};
var compressions$2 = {};
var flate = {};
var common = {};
(function(exports) {
  var TYPED_OK = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Int32Array !== "undefined";
  function _has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }
  exports.assign = function(obj) {
    var sources = Array.prototype.slice.call(arguments, 1);
    while (sources.length) {
      var source = sources.shift();
      if (!source) {
        continue;
      }
      if (typeof source !== "object") {
        throw new TypeError(source + "must be non-object");
      }
      for (var p in source) {
        if (_has(source, p)) {
          obj[p] = source[p];
        }
      }
    }
    return obj;
  };
  exports.shrinkBuf = function(buf, size) {
    if (buf.length === size) {
      return buf;
    }
    if (buf.subarray) {
      return buf.subarray(0, size);
    }
    buf.length = size;
    return buf;
  };
  var fnTyped = {
    arraySet: function(dest, src, src_offs, len, dest_offs) {
      if (src.subarray && dest.subarray) {
        dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
        return;
      }
      for (var i = 0; i < len; i++) {
        dest[dest_offs + i] = src[src_offs + i];
      }
    },
    // Join array of chunks to single array.
    flattenChunks: function(chunks) {
      var i, l2, len, pos, chunk, result;
      len = 0;
      for (i = 0, l2 = chunks.length; i < l2; i++) {
        len += chunks[i].length;
      }
      result = new Uint8Array(len);
      pos = 0;
      for (i = 0, l2 = chunks.length; i < l2; i++) {
        chunk = chunks[i];
        result.set(chunk, pos);
        pos += chunk.length;
      }
      return result;
    }
  };
  var fnUntyped = {
    arraySet: function(dest, src, src_offs, len, dest_offs) {
      for (var i = 0; i < len; i++) {
        dest[dest_offs + i] = src[src_offs + i];
      }
    },
    // Join array of chunks to single array.
    flattenChunks: function(chunks) {
      return [].concat.apply([], chunks);
    }
  };
  exports.setTyped = function(on) {
    if (on) {
      exports.Buf8 = Uint8Array;
      exports.Buf16 = Uint16Array;
      exports.Buf32 = Int32Array;
      exports.assign(exports, fnTyped);
    } else {
      exports.Buf8 = Array;
      exports.Buf16 = Array;
      exports.Buf32 = Array;
      exports.assign(exports, fnUntyped);
    }
  };
  exports.setTyped(TYPED_OK);
})(common);
var deflate$4 = {};
var deflate$3 = {};
var trees$1 = {};
var utils$j = common;
var Z_FIXED$1 = 4;
var Z_BINARY = 0;
var Z_TEXT = 1;
var Z_UNKNOWN$1 = 2;
function zero$1(buf) {
  var len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
}
var STORED_BLOCK = 0;
var STATIC_TREES = 1;
var DYN_TREES = 2;
var MIN_MATCH$1 = 3;
var MAX_MATCH$1 = 258;
var LENGTH_CODES$1 = 29;
var LITERALS$1 = 256;
var L_CODES$1 = LITERALS$1 + 1 + LENGTH_CODES$1;
var D_CODES$1 = 30;
var BL_CODES$1 = 19;
var HEAP_SIZE$1 = 2 * L_CODES$1 + 1;
var MAX_BITS$1 = 15;
var Buf_size = 16;
var MAX_BL_BITS = 7;
var END_BLOCK = 256;
var REP_3_6 = 16;
var REPZ_3_10 = 17;
var REPZ_11_138 = 18;
var extra_lbits = (
  /* extra bits for each length code */
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
);
var extra_dbits = (
  /* extra bits for each distance code */
  [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
);
var extra_blbits = (
  /* extra bits for each bit length code */
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]
);
var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
var DIST_CODE_LEN = 512;
var static_ltree = new Array((L_CODES$1 + 2) * 2);
zero$1(static_ltree);
var static_dtree = new Array(D_CODES$1 * 2);
zero$1(static_dtree);
var _dist_code = new Array(DIST_CODE_LEN);
zero$1(_dist_code);
var _length_code = new Array(MAX_MATCH$1 - MIN_MATCH$1 + 1);
zero$1(_length_code);
var base_length = new Array(LENGTH_CODES$1);
zero$1(base_length);
var base_dist = new Array(D_CODES$1);
zero$1(base_dist);
function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
  this.static_tree = static_tree;
  this.extra_bits = extra_bits;
  this.extra_base = extra_base;
  this.elems = elems;
  this.max_length = max_length;
  this.has_stree = static_tree && static_tree.length;
}
var static_l_desc;
var static_d_desc;
var static_bl_desc;
function TreeDesc(dyn_tree, stat_desc) {
  this.dyn_tree = dyn_tree;
  this.max_code = 0;
  this.stat_desc = stat_desc;
}
function d_code(dist) {
  return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
}
function put_short(s2, w) {
  s2.pending_buf[s2.pending++] = w & 255;
  s2.pending_buf[s2.pending++] = w >>> 8 & 255;
}
function send_bits(s2, value, length) {
  if (s2.bi_valid > Buf_size - length) {
    s2.bi_buf |= value << s2.bi_valid & 65535;
    put_short(s2, s2.bi_buf);
    s2.bi_buf = value >> Buf_size - s2.bi_valid;
    s2.bi_valid += length - Buf_size;
  } else {
    s2.bi_buf |= value << s2.bi_valid & 65535;
    s2.bi_valid += length;
  }
}
function send_code(s2, c2, tree) {
  send_bits(
    s2,
    tree[c2 * 2],
    tree[c2 * 2 + 1]
    /*.Len*/
  );
}
function bi_reverse(code, len) {
  var res = 0;
  do {
    res |= code & 1;
    code >>>= 1;
    res <<= 1;
  } while (--len > 0);
  return res >>> 1;
}
function bi_flush(s2) {
  if (s2.bi_valid === 16) {
    put_short(s2, s2.bi_buf);
    s2.bi_buf = 0;
    s2.bi_valid = 0;
  } else if (s2.bi_valid >= 8) {
    s2.pending_buf[s2.pending++] = s2.bi_buf & 255;
    s2.bi_buf >>= 8;
    s2.bi_valid -= 8;
  }
}
function gen_bitlen(s2, desc) {
  var tree = desc.dyn_tree;
  var max_code = desc.max_code;
  var stree = desc.stat_desc.static_tree;
  var has_stree = desc.stat_desc.has_stree;
  var extra = desc.stat_desc.extra_bits;
  var base = desc.stat_desc.extra_base;
  var max_length = desc.stat_desc.max_length;
  var h2;
  var n2, m;
  var bits;
  var xbits;
  var f2;
  var overflow = 0;
  for (bits = 0; bits <= MAX_BITS$1; bits++) {
    s2.bl_count[bits] = 0;
  }
  tree[s2.heap[s2.heap_max] * 2 + 1] = 0;
  for (h2 = s2.heap_max + 1; h2 < HEAP_SIZE$1; h2++) {
    n2 = s2.heap[h2];
    bits = tree[tree[n2 * 2 + 1] * 2 + 1] + 1;
    if (bits > max_length) {
      bits = max_length;
      overflow++;
    }
    tree[n2 * 2 + 1] = bits;
    if (n2 > max_code) {
      continue;
    }
    s2.bl_count[bits]++;
    xbits = 0;
    if (n2 >= base) {
      xbits = extra[n2 - base];
    }
    f2 = tree[n2 * 2];
    s2.opt_len += f2 * (bits + xbits);
    if (has_stree) {
      s2.static_len += f2 * (stree[n2 * 2 + 1] + xbits);
    }
  }
  if (overflow === 0) {
    return;
  }
  do {
    bits = max_length - 1;
    while (s2.bl_count[bits] === 0) {
      bits--;
    }
    s2.bl_count[bits]--;
    s2.bl_count[bits + 1] += 2;
    s2.bl_count[max_length]--;
    overflow -= 2;
  } while (overflow > 0);
  for (bits = max_length; bits !== 0; bits--) {
    n2 = s2.bl_count[bits];
    while (n2 !== 0) {
      m = s2.heap[--h2];
      if (m > max_code) {
        continue;
      }
      if (tree[m * 2 + 1] !== bits) {
        s2.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
        tree[m * 2 + 1] = bits;
      }
      n2--;
    }
  }
}
function gen_codes(tree, max_code, bl_count) {
  var next_code = new Array(MAX_BITS$1 + 1);
  var code = 0;
  var bits;
  var n2;
  for (bits = 1; bits <= MAX_BITS$1; bits++) {
    next_code[bits] = code = code + bl_count[bits - 1] << 1;
  }
  for (n2 = 0; n2 <= max_code; n2++) {
    var len = tree[n2 * 2 + 1];
    if (len === 0) {
      continue;
    }
    tree[n2 * 2] = bi_reverse(next_code[len]++, len);
  }
}
function tr_static_init() {
  var n2;
  var bits;
  var length;
  var code;
  var dist;
  var bl_count = new Array(MAX_BITS$1 + 1);
  length = 0;
  for (code = 0; code < LENGTH_CODES$1 - 1; code++) {
    base_length[code] = length;
    for (n2 = 0; n2 < 1 << extra_lbits[code]; n2++) {
      _length_code[length++] = code;
    }
  }
  _length_code[length - 1] = code;
  dist = 0;
  for (code = 0; code < 16; code++) {
    base_dist[code] = dist;
    for (n2 = 0; n2 < 1 << extra_dbits[code]; n2++) {
      _dist_code[dist++] = code;
    }
  }
  dist >>= 7;
  for (; code < D_CODES$1; code++) {
    base_dist[code] = dist << 7;
    for (n2 = 0; n2 < 1 << extra_dbits[code] - 7; n2++) {
      _dist_code[256 + dist++] = code;
    }
  }
  for (bits = 0; bits <= MAX_BITS$1; bits++) {
    bl_count[bits] = 0;
  }
  n2 = 0;
  while (n2 <= 143) {
    static_ltree[n2 * 2 + 1] = 8;
    n2++;
    bl_count[8]++;
  }
  while (n2 <= 255) {
    static_ltree[n2 * 2 + 1] = 9;
    n2++;
    bl_count[9]++;
  }
  while (n2 <= 279) {
    static_ltree[n2 * 2 + 1] = 7;
    n2++;
    bl_count[7]++;
  }
  while (n2 <= 287) {
    static_ltree[n2 * 2 + 1] = 8;
    n2++;
    bl_count[8]++;
  }
  gen_codes(static_ltree, L_CODES$1 + 1, bl_count);
  for (n2 = 0; n2 < D_CODES$1; n2++) {
    static_dtree[n2 * 2 + 1] = 5;
    static_dtree[n2 * 2] = bi_reverse(n2, 5);
  }
  static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS$1 + 1, L_CODES$1, MAX_BITS$1);
  static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES$1, MAX_BITS$1);
  static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES$1, MAX_BL_BITS);
}
function init_block(s2) {
  var n2;
  for (n2 = 0; n2 < L_CODES$1; n2++) {
    s2.dyn_ltree[n2 * 2] = 0;
  }
  for (n2 = 0; n2 < D_CODES$1; n2++) {
    s2.dyn_dtree[n2 * 2] = 0;
  }
  for (n2 = 0; n2 < BL_CODES$1; n2++) {
    s2.bl_tree[n2 * 2] = 0;
  }
  s2.dyn_ltree[END_BLOCK * 2] = 1;
  s2.opt_len = s2.static_len = 0;
  s2.last_lit = s2.matches = 0;
}
function bi_windup(s2) {
  if (s2.bi_valid > 8) {
    put_short(s2, s2.bi_buf);
  } else if (s2.bi_valid > 0) {
    s2.pending_buf[s2.pending++] = s2.bi_buf;
  }
  s2.bi_buf = 0;
  s2.bi_valid = 0;
}
function copy_block(s2, buf, len, header) {
  bi_windup(s2);
  {
    put_short(s2, len);
    put_short(s2, ~len);
  }
  utils$j.arraySet(s2.pending_buf, s2.window, buf, len, s2.pending);
  s2.pending += len;
}
function smaller(tree, n2, m, depth) {
  var _n2 = n2 * 2;
  var _m2 = m * 2;
  return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n2] <= depth[m];
}
function pqdownheap(s2, tree, k) {
  var v = s2.heap[k];
  var j = k << 1;
  while (j <= s2.heap_len) {
    if (j < s2.heap_len && smaller(tree, s2.heap[j + 1], s2.heap[j], s2.depth)) {
      j++;
    }
    if (smaller(tree, v, s2.heap[j], s2.depth)) {
      break;
    }
    s2.heap[k] = s2.heap[j];
    k = j;
    j <<= 1;
  }
  s2.heap[k] = v;
}
function compress_block(s2, ltree, dtree) {
  var dist;
  var lc;
  var lx = 0;
  var code;
  var extra;
  if (s2.last_lit !== 0) {
    do {
      dist = s2.pending_buf[s2.d_buf + lx * 2] << 8 | s2.pending_buf[s2.d_buf + lx * 2 + 1];
      lc = s2.pending_buf[s2.l_buf + lx];
      lx++;
      if (dist === 0) {
        send_code(s2, lc, ltree);
      } else {
        code = _length_code[lc];
        send_code(s2, code + LITERALS$1 + 1, ltree);
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s2, lc, extra);
        }
        dist--;
        code = d_code(dist);
        send_code(s2, code, dtree);
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s2, dist, extra);
        }
      }
    } while (lx < s2.last_lit);
  }
  send_code(s2, END_BLOCK, ltree);
}
function build_tree(s2, desc) {
  var tree = desc.dyn_tree;
  var stree = desc.stat_desc.static_tree;
  var has_stree = desc.stat_desc.has_stree;
  var elems = desc.stat_desc.elems;
  var n2, m;
  var max_code = -1;
  var node2;
  s2.heap_len = 0;
  s2.heap_max = HEAP_SIZE$1;
  for (n2 = 0; n2 < elems; n2++) {
    if (tree[n2 * 2] !== 0) {
      s2.heap[++s2.heap_len] = max_code = n2;
      s2.depth[n2] = 0;
    } else {
      tree[n2 * 2 + 1] = 0;
    }
  }
  while (s2.heap_len < 2) {
    node2 = s2.heap[++s2.heap_len] = max_code < 2 ? ++max_code : 0;
    tree[node2 * 2] = 1;
    s2.depth[node2] = 0;
    s2.opt_len--;
    if (has_stree) {
      s2.static_len -= stree[node2 * 2 + 1];
    }
  }
  desc.max_code = max_code;
  for (n2 = s2.heap_len >> 1; n2 >= 1; n2--) {
    pqdownheap(s2, tree, n2);
  }
  node2 = elems;
  do {
    n2 = s2.heap[
      1
      /*SMALLEST*/
    ];
    s2.heap[
      1
      /*SMALLEST*/
    ] = s2.heap[s2.heap_len--];
    pqdownheap(
      s2,
      tree,
      1
      /*SMALLEST*/
    );
    m = s2.heap[
      1
      /*SMALLEST*/
    ];
    s2.heap[--s2.heap_max] = n2;
    s2.heap[--s2.heap_max] = m;
    tree[node2 * 2] = tree[n2 * 2] + tree[m * 2];
    s2.depth[node2] = (s2.depth[n2] >= s2.depth[m] ? s2.depth[n2] : s2.depth[m]) + 1;
    tree[n2 * 2 + 1] = tree[m * 2 + 1] = node2;
    s2.heap[
      1
      /*SMALLEST*/
    ] = node2++;
    pqdownheap(
      s2,
      tree,
      1
      /*SMALLEST*/
    );
  } while (s2.heap_len >= 2);
  s2.heap[--s2.heap_max] = s2.heap[
    1
    /*SMALLEST*/
  ];
  gen_bitlen(s2, desc);
  gen_codes(tree, max_code, s2.bl_count);
}
function scan_tree(s2, tree, max_code) {
  var n2;
  var prevlen = -1;
  var curlen;
  var nextlen = tree[0 * 2 + 1];
  var count = 0;
  var max_count = 7;
  var min_count = 4;
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  tree[(max_code + 1) * 2 + 1] = 65535;
  for (n2 = 0; n2 <= max_code; n2++) {
    curlen = nextlen;
    nextlen = tree[(n2 + 1) * 2 + 1];
    if (++count < max_count && curlen === nextlen) {
      continue;
    } else if (count < min_count) {
      s2.bl_tree[curlen * 2] += count;
    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        s2.bl_tree[curlen * 2]++;
      }
      s2.bl_tree[REP_3_6 * 2]++;
    } else if (count <= 10) {
      s2.bl_tree[REPZ_3_10 * 2]++;
    } else {
      s2.bl_tree[REPZ_11_138 * 2]++;
    }
    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}
function send_tree(s2, tree, max_code) {
  var n2;
  var prevlen = -1;
  var curlen;
  var nextlen = tree[0 * 2 + 1];
  var count = 0;
  var max_count = 7;
  var min_count = 4;
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  for (n2 = 0; n2 <= max_code; n2++) {
    curlen = nextlen;
    nextlen = tree[(n2 + 1) * 2 + 1];
    if (++count < max_count && curlen === nextlen) {
      continue;
    } else if (count < min_count) {
      do {
        send_code(s2, curlen, s2.bl_tree);
      } while (--count !== 0);
    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        send_code(s2, curlen, s2.bl_tree);
        count--;
      }
      send_code(s2, REP_3_6, s2.bl_tree);
      send_bits(s2, count - 3, 2);
    } else if (count <= 10) {
      send_code(s2, REPZ_3_10, s2.bl_tree);
      send_bits(s2, count - 3, 3);
    } else {
      send_code(s2, REPZ_11_138, s2.bl_tree);
      send_bits(s2, count - 11, 7);
    }
    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}
function build_bl_tree(s2) {
  var max_blindex;
  scan_tree(s2, s2.dyn_ltree, s2.l_desc.max_code);
  scan_tree(s2, s2.dyn_dtree, s2.d_desc.max_code);
  build_tree(s2, s2.bl_desc);
  for (max_blindex = BL_CODES$1 - 1; max_blindex >= 3; max_blindex--) {
    if (s2.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
      break;
    }
  }
  s2.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
  return max_blindex;
}
function send_all_trees(s2, lcodes, dcodes, blcodes) {
  var rank2;
  send_bits(s2, lcodes - 257, 5);
  send_bits(s2, dcodes - 1, 5);
  send_bits(s2, blcodes - 4, 4);
  for (rank2 = 0; rank2 < blcodes; rank2++) {
    send_bits(s2, s2.bl_tree[bl_order[rank2] * 2 + 1], 3);
  }
  send_tree(s2, s2.dyn_ltree, lcodes - 1);
  send_tree(s2, s2.dyn_dtree, dcodes - 1);
}
function detect_data_type(s2) {
  var black_mask = 4093624447;
  var n2;
  for (n2 = 0; n2 <= 31; n2++, black_mask >>>= 1) {
    if (black_mask & 1 && s2.dyn_ltree[n2 * 2] !== 0) {
      return Z_BINARY;
    }
  }
  if (s2.dyn_ltree[9 * 2] !== 0 || s2.dyn_ltree[10 * 2] !== 0 || s2.dyn_ltree[13 * 2] !== 0) {
    return Z_TEXT;
  }
  for (n2 = 32; n2 < LITERALS$1; n2++) {
    if (s2.dyn_ltree[n2 * 2] !== 0) {
      return Z_TEXT;
    }
  }
  return Z_BINARY;
}
var static_init_done = false;
function _tr_init(s2) {
  if (!static_init_done) {
    tr_static_init();
    static_init_done = true;
  }
  s2.l_desc = new TreeDesc(s2.dyn_ltree, static_l_desc);
  s2.d_desc = new TreeDesc(s2.dyn_dtree, static_d_desc);
  s2.bl_desc = new TreeDesc(s2.bl_tree, static_bl_desc);
  s2.bi_buf = 0;
  s2.bi_valid = 0;
  init_block(s2);
}
function _tr_stored_block(s2, buf, stored_len, last) {
  send_bits(s2, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
  copy_block(s2, buf, stored_len);
}
function _tr_align(s2) {
  send_bits(s2, STATIC_TREES << 1, 3);
  send_code(s2, END_BLOCK, static_ltree);
  bi_flush(s2);
}
function _tr_flush_block(s2, buf, stored_len, last) {
  var opt_lenb, static_lenb;
  var max_blindex = 0;
  if (s2.level > 0) {
    if (s2.strm.data_type === Z_UNKNOWN$1) {
      s2.strm.data_type = detect_data_type(s2);
    }
    build_tree(s2, s2.l_desc);
    build_tree(s2, s2.d_desc);
    max_blindex = build_bl_tree(s2);
    opt_lenb = s2.opt_len + 3 + 7 >>> 3;
    static_lenb = s2.static_len + 3 + 7 >>> 3;
    if (static_lenb <= opt_lenb) {
      opt_lenb = static_lenb;
    }
  } else {
    opt_lenb = static_lenb = stored_len + 5;
  }
  if (stored_len + 4 <= opt_lenb && buf !== -1) {
    _tr_stored_block(s2, buf, stored_len, last);
  } else if (s2.strategy === Z_FIXED$1 || static_lenb === opt_lenb) {
    send_bits(s2, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
    compress_block(s2, static_ltree, static_dtree);
  } else {
    send_bits(s2, (DYN_TREES << 1) + (last ? 1 : 0), 3);
    send_all_trees(s2, s2.l_desc.max_code + 1, s2.d_desc.max_code + 1, max_blindex + 1);
    compress_block(s2, s2.dyn_ltree, s2.dyn_dtree);
  }
  init_block(s2);
  if (last) {
    bi_windup(s2);
  }
}
function _tr_tally(s2, dist, lc) {
  s2.pending_buf[s2.d_buf + s2.last_lit * 2] = dist >>> 8 & 255;
  s2.pending_buf[s2.d_buf + s2.last_lit * 2 + 1] = dist & 255;
  s2.pending_buf[s2.l_buf + s2.last_lit] = lc & 255;
  s2.last_lit++;
  if (dist === 0) {
    s2.dyn_ltree[lc * 2]++;
  } else {
    s2.matches++;
    dist--;
    s2.dyn_ltree[(_length_code[lc] + LITERALS$1 + 1) * 2]++;
    s2.dyn_dtree[d_code(dist) * 2]++;
  }
  return s2.last_lit === s2.lit_bufsize - 1;
}
trees$1._tr_init = _tr_init;
trees$1._tr_stored_block = _tr_stored_block;
trees$1._tr_flush_block = _tr_flush_block;
trees$1._tr_tally = _tr_tally;
trees$1._tr_align = _tr_align;
function adler32$2(adler, buf, len, pos) {
  var s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n2 = 0;
  while (len !== 0) {
    n2 = len > 2e3 ? 2e3 : len;
    len -= n2;
    do {
      s1 = s1 + buf[pos++] | 0;
      s2 = s2 + s1 | 0;
    } while (--n2);
    s1 %= 65521;
    s2 %= 65521;
  }
  return s1 | s2 << 16 | 0;
}
var adler32_1 = adler32$2;
function makeTable() {
  var c2, table = [];
  for (var n2 = 0; n2 < 256; n2++) {
    c2 = n2;
    for (var k = 0; k < 8; k++) {
      c2 = c2 & 1 ? 3988292384 ^ c2 >>> 1 : c2 >>> 1;
    }
    table[n2] = c2;
  }
  return table;
}
var crcTable = makeTable();
function crc32$3(crc, buf, len, pos) {
  var t2 = crcTable, end = pos + len;
  crc ^= -1;
  for (var i = pos; i < end; i++) {
    crc = crc >>> 8 ^ t2[(crc ^ buf[i]) & 255];
  }
  return crc ^ -1;
}
var crc32_1 = crc32$3;
var messages = {
  2: "need dictionary",
  /* Z_NEED_DICT       2  */
  1: "stream end",
  /* Z_STREAM_END      1  */
  0: "",
  /* Z_OK              0  */
  "-1": "file error",
  /* Z_ERRNO         (-1) */
  "-2": "stream error",
  /* Z_STREAM_ERROR  (-2) */
  "-3": "data error",
  /* Z_DATA_ERROR    (-3) */
  "-4": "insufficient memory",
  /* Z_MEM_ERROR     (-4) */
  "-5": "buffer error",
  /* Z_BUF_ERROR     (-5) */
  "-6": "incompatible version"
  /* Z_VERSION_ERROR (-6) */
};
var utils$i = common;
var trees = trees$1;
var adler32$1 = adler32_1;
var crc32$2 = crc32_1;
var msg$2 = messages;
var Z_NO_FLUSH$1 = 0;
var Z_PARTIAL_FLUSH = 1;
var Z_FULL_FLUSH = 3;
var Z_FINISH$2 = 4;
var Z_BLOCK$1 = 5;
var Z_OK$2 = 0;
var Z_STREAM_END$2 = 1;
var Z_STREAM_ERROR$1 = -2;
var Z_DATA_ERROR$1 = -3;
var Z_BUF_ERROR$1 = -5;
var Z_DEFAULT_COMPRESSION$1 = -1;
var Z_FILTERED = 1;
var Z_HUFFMAN_ONLY = 2;
var Z_RLE = 3;
var Z_FIXED = 4;
var Z_DEFAULT_STRATEGY$1 = 0;
var Z_UNKNOWN = 2;
var Z_DEFLATED$2 = 8;
var MAX_MEM_LEVEL = 9;
var MAX_WBITS$1 = 15;
var DEF_MEM_LEVEL = 8;
var LENGTH_CODES = 29;
var LITERALS = 256;
var L_CODES = LITERALS + 1 + LENGTH_CODES;
var D_CODES = 30;
var BL_CODES = 19;
var HEAP_SIZE = 2 * L_CODES + 1;
var MAX_BITS = 15;
var MIN_MATCH = 3;
var MAX_MATCH = 258;
var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
var PRESET_DICT = 32;
var INIT_STATE = 42;
var EXTRA_STATE = 69;
var NAME_STATE = 73;
var COMMENT_STATE = 91;
var HCRC_STATE = 103;
var BUSY_STATE = 113;
var FINISH_STATE = 666;
var BS_NEED_MORE = 1;
var BS_BLOCK_DONE = 2;
var BS_FINISH_STARTED = 3;
var BS_FINISH_DONE = 4;
var OS_CODE = 3;
function err(strm, errorCode) {
  strm.msg = msg$2[errorCode];
  return errorCode;
}
function rank(f2) {
  return (f2 << 1) - (f2 > 4 ? 9 : 0);
}
function zero(buf) {
  var len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
}
function flush_pending(strm) {
  var s2 = strm.state;
  var len = s2.pending;
  if (len > strm.avail_out) {
    len = strm.avail_out;
  }
  if (len === 0) {
    return;
  }
  utils$i.arraySet(strm.output, s2.pending_buf, s2.pending_out, len, strm.next_out);
  strm.next_out += len;
  s2.pending_out += len;
  strm.total_out += len;
  strm.avail_out -= len;
  s2.pending -= len;
  if (s2.pending === 0) {
    s2.pending_out = 0;
  }
}
function flush_block_only(s2, last) {
  trees._tr_flush_block(s2, s2.block_start >= 0 ? s2.block_start : -1, s2.strstart - s2.block_start, last);
  s2.block_start = s2.strstart;
  flush_pending(s2.strm);
}
function put_byte(s2, b2) {
  s2.pending_buf[s2.pending++] = b2;
}
function putShortMSB(s2, b2) {
  s2.pending_buf[s2.pending++] = b2 >>> 8 & 255;
  s2.pending_buf[s2.pending++] = b2 & 255;
}
function read_buf(strm, buf, start, size) {
  var len = strm.avail_in;
  if (len > size) {
    len = size;
  }
  if (len === 0) {
    return 0;
  }
  strm.avail_in -= len;
  utils$i.arraySet(buf, strm.input, strm.next_in, len, start);
  if (strm.state.wrap === 1) {
    strm.adler = adler32$1(strm.adler, buf, len, start);
  } else if (strm.state.wrap === 2) {
    strm.adler = crc32$2(strm.adler, buf, len, start);
  }
  strm.next_in += len;
  strm.total_in += len;
  return len;
}
function longest_match(s2, cur_match) {
  var chain_length = s2.max_chain_length;
  var scan = s2.strstart;
  var match;
  var len;
  var best_len = s2.prev_length;
  var nice_match = s2.nice_match;
  var limit = s2.strstart > s2.w_size - MIN_LOOKAHEAD ? s2.strstart - (s2.w_size - MIN_LOOKAHEAD) : 0;
  var _win = s2.window;
  var wmask = s2.w_mask;
  var prev = s2.prev;
  var strend = s2.strstart + MAX_MATCH;
  var scan_end1 = _win[scan + best_len - 1];
  var scan_end = _win[scan + best_len];
  if (s2.prev_length >= s2.good_match) {
    chain_length >>= 2;
  }
  if (nice_match > s2.lookahead) {
    nice_match = s2.lookahead;
  }
  do {
    match = cur_match;
    if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
      continue;
    }
    scan += 2;
    match++;
    do {
    } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
    len = MAX_MATCH - (strend - scan);
    scan = strend - MAX_MATCH;
    if (len > best_len) {
      s2.match_start = cur_match;
      best_len = len;
      if (len >= nice_match) {
        break;
      }
      scan_end1 = _win[scan + best_len - 1];
      scan_end = _win[scan + best_len];
    }
  } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
  if (best_len <= s2.lookahead) {
    return best_len;
  }
  return s2.lookahead;
}
function fill_window(s2) {
  var _w_size = s2.w_size;
  var p, n2, m, more, str;
  do {
    more = s2.window_size - s2.lookahead - s2.strstart;
    if (s2.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
      utils$i.arraySet(s2.window, s2.window, _w_size, _w_size, 0);
      s2.match_start -= _w_size;
      s2.strstart -= _w_size;
      s2.block_start -= _w_size;
      n2 = s2.hash_size;
      p = n2;
      do {
        m = s2.head[--p];
        s2.head[p] = m >= _w_size ? m - _w_size : 0;
      } while (--n2);
      n2 = _w_size;
      p = n2;
      do {
        m = s2.prev[--p];
        s2.prev[p] = m >= _w_size ? m - _w_size : 0;
      } while (--n2);
      more += _w_size;
    }
    if (s2.strm.avail_in === 0) {
      break;
    }
    n2 = read_buf(s2.strm, s2.window, s2.strstart + s2.lookahead, more);
    s2.lookahead += n2;
    if (s2.lookahead + s2.insert >= MIN_MATCH) {
      str = s2.strstart - s2.insert;
      s2.ins_h = s2.window[str];
      s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[str + 1]) & s2.hash_mask;
      while (s2.insert) {
        s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[str + MIN_MATCH - 1]) & s2.hash_mask;
        s2.prev[str & s2.w_mask] = s2.head[s2.ins_h];
        s2.head[s2.ins_h] = str;
        str++;
        s2.insert--;
        if (s2.lookahead + s2.insert < MIN_MATCH) {
          break;
        }
      }
    }
  } while (s2.lookahead < MIN_LOOKAHEAD && s2.strm.avail_in !== 0);
}
function deflate_stored(s2, flush) {
  var max_block_size = 65535;
  if (max_block_size > s2.pending_buf_size - 5) {
    max_block_size = s2.pending_buf_size - 5;
  }
  for (; ; ) {
    if (s2.lookahead <= 1) {
      fill_window(s2);
      if (s2.lookahead === 0 && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }
      if (s2.lookahead === 0) {
        break;
      }
    }
    s2.strstart += s2.lookahead;
    s2.lookahead = 0;
    var max_start = s2.block_start + max_block_size;
    if (s2.strstart === 0 || s2.strstart >= max_start) {
      s2.lookahead = s2.strstart - max_start;
      s2.strstart = max_start;
      flush_block_only(s2, false);
      if (s2.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
    if (s2.strstart - s2.block_start >= s2.w_size - MIN_LOOKAHEAD) {
      flush_block_only(s2, false);
      if (s2.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s2.insert = 0;
  if (flush === Z_FINISH$2) {
    flush_block_only(s2, true);
    if (s2.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s2.strstart > s2.block_start) {
    flush_block_only(s2, false);
    if (s2.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_NEED_MORE;
}
function deflate_fast(s2, flush) {
  var hash_head;
  var bflush;
  for (; ; ) {
    if (s2.lookahead < MIN_LOOKAHEAD) {
      fill_window(s2);
      if (s2.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }
      if (s2.lookahead === 0) {
        break;
      }
    }
    hash_head = 0;
    if (s2.lookahead >= MIN_MATCH) {
      s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[s2.strstart + MIN_MATCH - 1]) & s2.hash_mask;
      hash_head = s2.prev[s2.strstart & s2.w_mask] = s2.head[s2.ins_h];
      s2.head[s2.ins_h] = s2.strstart;
    }
    if (hash_head !== 0 && s2.strstart - hash_head <= s2.w_size - MIN_LOOKAHEAD) {
      s2.match_length = longest_match(s2, hash_head);
    }
    if (s2.match_length >= MIN_MATCH) {
      bflush = trees._tr_tally(s2, s2.strstart - s2.match_start, s2.match_length - MIN_MATCH);
      s2.lookahead -= s2.match_length;
      if (s2.match_length <= s2.max_lazy_match && s2.lookahead >= MIN_MATCH) {
        s2.match_length--;
        do {
          s2.strstart++;
          s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[s2.strstart + MIN_MATCH - 1]) & s2.hash_mask;
          hash_head = s2.prev[s2.strstart & s2.w_mask] = s2.head[s2.ins_h];
          s2.head[s2.ins_h] = s2.strstart;
        } while (--s2.match_length !== 0);
        s2.strstart++;
      } else {
        s2.strstart += s2.match_length;
        s2.match_length = 0;
        s2.ins_h = s2.window[s2.strstart];
        s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[s2.strstart + 1]) & s2.hash_mask;
      }
    } else {
      bflush = trees._tr_tally(s2, 0, s2.window[s2.strstart]);
      s2.lookahead--;
      s2.strstart++;
    }
    if (bflush) {
      flush_block_only(s2, false);
      if (s2.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s2.insert = s2.strstart < MIN_MATCH - 1 ? s2.strstart : MIN_MATCH - 1;
  if (flush === Z_FINISH$2) {
    flush_block_only(s2, true);
    if (s2.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s2.last_lit) {
    flush_block_only(s2, false);
    if (s2.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function deflate_slow(s2, flush) {
  var hash_head;
  var bflush;
  var max_insert;
  for (; ; ) {
    if (s2.lookahead < MIN_LOOKAHEAD) {
      fill_window(s2);
      if (s2.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }
      if (s2.lookahead === 0) {
        break;
      }
    }
    hash_head = 0;
    if (s2.lookahead >= MIN_MATCH) {
      s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[s2.strstart + MIN_MATCH - 1]) & s2.hash_mask;
      hash_head = s2.prev[s2.strstart & s2.w_mask] = s2.head[s2.ins_h];
      s2.head[s2.ins_h] = s2.strstart;
    }
    s2.prev_length = s2.match_length;
    s2.prev_match = s2.match_start;
    s2.match_length = MIN_MATCH - 1;
    if (hash_head !== 0 && s2.prev_length < s2.max_lazy_match && s2.strstart - hash_head <= s2.w_size - MIN_LOOKAHEAD) {
      s2.match_length = longest_match(s2, hash_head);
      if (s2.match_length <= 5 && (s2.strategy === Z_FILTERED || s2.match_length === MIN_MATCH && s2.strstart - s2.match_start > 4096)) {
        s2.match_length = MIN_MATCH - 1;
      }
    }
    if (s2.prev_length >= MIN_MATCH && s2.match_length <= s2.prev_length) {
      max_insert = s2.strstart + s2.lookahead - MIN_MATCH;
      bflush = trees._tr_tally(s2, s2.strstart - 1 - s2.prev_match, s2.prev_length - MIN_MATCH);
      s2.lookahead -= s2.prev_length - 1;
      s2.prev_length -= 2;
      do {
        if (++s2.strstart <= max_insert) {
          s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[s2.strstart + MIN_MATCH - 1]) & s2.hash_mask;
          hash_head = s2.prev[s2.strstart & s2.w_mask] = s2.head[s2.ins_h];
          s2.head[s2.ins_h] = s2.strstart;
        }
      } while (--s2.prev_length !== 0);
      s2.match_available = 0;
      s2.match_length = MIN_MATCH - 1;
      s2.strstart++;
      if (bflush) {
        flush_block_only(s2, false);
        if (s2.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
    } else if (s2.match_available) {
      bflush = trees._tr_tally(s2, 0, s2.window[s2.strstart - 1]);
      if (bflush) {
        flush_block_only(s2, false);
      }
      s2.strstart++;
      s2.lookahead--;
      if (s2.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    } else {
      s2.match_available = 1;
      s2.strstart++;
      s2.lookahead--;
    }
  }
  if (s2.match_available) {
    bflush = trees._tr_tally(s2, 0, s2.window[s2.strstart - 1]);
    s2.match_available = 0;
  }
  s2.insert = s2.strstart < MIN_MATCH - 1 ? s2.strstart : MIN_MATCH - 1;
  if (flush === Z_FINISH$2) {
    flush_block_only(s2, true);
    if (s2.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s2.last_lit) {
    flush_block_only(s2, false);
    if (s2.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function deflate_rle(s2, flush) {
  var bflush;
  var prev;
  var scan, strend;
  var _win = s2.window;
  for (; ; ) {
    if (s2.lookahead <= MAX_MATCH) {
      fill_window(s2);
      if (s2.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }
      if (s2.lookahead === 0) {
        break;
      }
    }
    s2.match_length = 0;
    if (s2.lookahead >= MIN_MATCH && s2.strstart > 0) {
      scan = s2.strstart - 1;
      prev = _win[scan];
      if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
        strend = s2.strstart + MAX_MATCH;
        do {
        } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);
        s2.match_length = MAX_MATCH - (strend - scan);
        if (s2.match_length > s2.lookahead) {
          s2.match_length = s2.lookahead;
        }
      }
    }
    if (s2.match_length >= MIN_MATCH) {
      bflush = trees._tr_tally(s2, 1, s2.match_length - MIN_MATCH);
      s2.lookahead -= s2.match_length;
      s2.strstart += s2.match_length;
      s2.match_length = 0;
    } else {
      bflush = trees._tr_tally(s2, 0, s2.window[s2.strstart]);
      s2.lookahead--;
      s2.strstart++;
    }
    if (bflush) {
      flush_block_only(s2, false);
      if (s2.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s2.insert = 0;
  if (flush === Z_FINISH$2) {
    flush_block_only(s2, true);
    if (s2.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s2.last_lit) {
    flush_block_only(s2, false);
    if (s2.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function deflate_huff(s2, flush) {
  var bflush;
  for (; ; ) {
    if (s2.lookahead === 0) {
      fill_window(s2);
      if (s2.lookahead === 0) {
        if (flush === Z_NO_FLUSH$1) {
          return BS_NEED_MORE;
        }
        break;
      }
    }
    s2.match_length = 0;
    bflush = trees._tr_tally(s2, 0, s2.window[s2.strstart]);
    s2.lookahead--;
    s2.strstart++;
    if (bflush) {
      flush_block_only(s2, false);
      if (s2.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s2.insert = 0;
  if (flush === Z_FINISH$2) {
    flush_block_only(s2, true);
    if (s2.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s2.last_lit) {
    flush_block_only(s2, false);
    if (s2.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function Config(good_length, max_lazy, nice_length, max_chain, func) {
  this.good_length = good_length;
  this.max_lazy = max_lazy;
  this.nice_length = nice_length;
  this.max_chain = max_chain;
  this.func = func;
}
var configuration_table;
configuration_table = [
  /*      good lazy nice chain */
  new Config(0, 0, 0, 0, deflate_stored),
  /* 0 store only */
  new Config(4, 4, 8, 4, deflate_fast),
  /* 1 max speed, no lazy matches */
  new Config(4, 5, 16, 8, deflate_fast),
  /* 2 */
  new Config(4, 6, 32, 32, deflate_fast),
  /* 3 */
  new Config(4, 4, 16, 16, deflate_slow),
  /* 4 lazy matches */
  new Config(8, 16, 32, 32, deflate_slow),
  /* 5 */
  new Config(8, 16, 128, 128, deflate_slow),
  /* 6 */
  new Config(8, 32, 128, 256, deflate_slow),
  /* 7 */
  new Config(32, 128, 258, 1024, deflate_slow),
  /* 8 */
  new Config(32, 258, 258, 4096, deflate_slow)
  /* 9 max compression */
];
function lm_init(s2) {
  s2.window_size = 2 * s2.w_size;
  zero(s2.head);
  s2.max_lazy_match = configuration_table[s2.level].max_lazy;
  s2.good_match = configuration_table[s2.level].good_length;
  s2.nice_match = configuration_table[s2.level].nice_length;
  s2.max_chain_length = configuration_table[s2.level].max_chain;
  s2.strstart = 0;
  s2.block_start = 0;
  s2.lookahead = 0;
  s2.insert = 0;
  s2.match_length = s2.prev_length = MIN_MATCH - 1;
  s2.match_available = 0;
  s2.ins_h = 0;
}
function DeflateState() {
  this.strm = null;
  this.status = 0;
  this.pending_buf = null;
  this.pending_buf_size = 0;
  this.pending_out = 0;
  this.pending = 0;
  this.wrap = 0;
  this.gzhead = null;
  this.gzindex = 0;
  this.method = Z_DEFLATED$2;
  this.last_flush = -1;
  this.w_size = 0;
  this.w_bits = 0;
  this.w_mask = 0;
  this.window = null;
  this.window_size = 0;
  this.prev = null;
  this.head = null;
  this.ins_h = 0;
  this.hash_size = 0;
  this.hash_bits = 0;
  this.hash_mask = 0;
  this.hash_shift = 0;
  this.block_start = 0;
  this.match_length = 0;
  this.prev_match = 0;
  this.match_available = 0;
  this.strstart = 0;
  this.match_start = 0;
  this.lookahead = 0;
  this.prev_length = 0;
  this.max_chain_length = 0;
  this.max_lazy_match = 0;
  this.level = 0;
  this.strategy = 0;
  this.good_match = 0;
  this.nice_match = 0;
  this.dyn_ltree = new utils$i.Buf16(HEAP_SIZE * 2);
  this.dyn_dtree = new utils$i.Buf16((2 * D_CODES + 1) * 2);
  this.bl_tree = new utils$i.Buf16((2 * BL_CODES + 1) * 2);
  zero(this.dyn_ltree);
  zero(this.dyn_dtree);
  zero(this.bl_tree);
  this.l_desc = null;
  this.d_desc = null;
  this.bl_desc = null;
  this.bl_count = new utils$i.Buf16(MAX_BITS + 1);
  this.heap = new utils$i.Buf16(2 * L_CODES + 1);
  zero(this.heap);
  this.heap_len = 0;
  this.heap_max = 0;
  this.depth = new utils$i.Buf16(2 * L_CODES + 1);
  zero(this.depth);
  this.l_buf = 0;
  this.lit_bufsize = 0;
  this.last_lit = 0;
  this.d_buf = 0;
  this.opt_len = 0;
  this.static_len = 0;
  this.matches = 0;
  this.insert = 0;
  this.bi_buf = 0;
  this.bi_valid = 0;
}
function deflateResetKeep(strm) {
  var s2;
  if (!strm || !strm.state) {
    return err(strm, Z_STREAM_ERROR$1);
  }
  strm.total_in = strm.total_out = 0;
  strm.data_type = Z_UNKNOWN;
  s2 = strm.state;
  s2.pending = 0;
  s2.pending_out = 0;
  if (s2.wrap < 0) {
    s2.wrap = -s2.wrap;
  }
  s2.status = s2.wrap ? INIT_STATE : BUSY_STATE;
  strm.adler = s2.wrap === 2 ? 0 : 1;
  s2.last_flush = Z_NO_FLUSH$1;
  trees._tr_init(s2);
  return Z_OK$2;
}
function deflateReset(strm) {
  var ret = deflateResetKeep(strm);
  if (ret === Z_OK$2) {
    lm_init(strm.state);
  }
  return ret;
}
function deflateSetHeader(strm, head) {
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  if (strm.state.wrap !== 2) {
    return Z_STREAM_ERROR$1;
  }
  strm.state.gzhead = head;
  return Z_OK$2;
}
function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
  if (!strm) {
    return Z_STREAM_ERROR$1;
  }
  var wrap = 1;
  if (level === Z_DEFAULT_COMPRESSION$1) {
    level = 6;
  }
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  } else if (windowBits > 15) {
    wrap = 2;
    windowBits -= 16;
  }
  if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED$2 || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
    return err(strm, Z_STREAM_ERROR$1);
  }
  if (windowBits === 8) {
    windowBits = 9;
  }
  var s2 = new DeflateState();
  strm.state = s2;
  s2.strm = strm;
  s2.wrap = wrap;
  s2.gzhead = null;
  s2.w_bits = windowBits;
  s2.w_size = 1 << s2.w_bits;
  s2.w_mask = s2.w_size - 1;
  s2.hash_bits = memLevel + 7;
  s2.hash_size = 1 << s2.hash_bits;
  s2.hash_mask = s2.hash_size - 1;
  s2.hash_shift = ~~((s2.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
  s2.window = new utils$i.Buf8(s2.w_size * 2);
  s2.head = new utils$i.Buf16(s2.hash_size);
  s2.prev = new utils$i.Buf16(s2.w_size);
  s2.lit_bufsize = 1 << memLevel + 6;
  s2.pending_buf_size = s2.lit_bufsize * 4;
  s2.pending_buf = new utils$i.Buf8(s2.pending_buf_size);
  s2.d_buf = 1 * s2.lit_bufsize;
  s2.l_buf = (1 + 2) * s2.lit_bufsize;
  s2.level = level;
  s2.strategy = strategy;
  s2.method = method;
  return deflateReset(strm);
}
function deflateInit(strm, level) {
  return deflateInit2(strm, level, Z_DEFLATED$2, MAX_WBITS$1, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY$1);
}
function deflate$2(strm, flush) {
  var old_flush, s2;
  var beg, val;
  if (!strm || !strm.state || flush > Z_BLOCK$1 || flush < 0) {
    return strm ? err(strm, Z_STREAM_ERROR$1) : Z_STREAM_ERROR$1;
  }
  s2 = strm.state;
  if (!strm.output || !strm.input && strm.avail_in !== 0 || s2.status === FINISH_STATE && flush !== Z_FINISH$2) {
    return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR$1 : Z_STREAM_ERROR$1);
  }
  s2.strm = strm;
  old_flush = s2.last_flush;
  s2.last_flush = flush;
  if (s2.status === INIT_STATE) {
    if (s2.wrap === 2) {
      strm.adler = 0;
      put_byte(s2, 31);
      put_byte(s2, 139);
      put_byte(s2, 8);
      if (!s2.gzhead) {
        put_byte(s2, 0);
        put_byte(s2, 0);
        put_byte(s2, 0);
        put_byte(s2, 0);
        put_byte(s2, 0);
        put_byte(s2, s2.level === 9 ? 2 : s2.strategy >= Z_HUFFMAN_ONLY || s2.level < 2 ? 4 : 0);
        put_byte(s2, OS_CODE);
        s2.status = BUSY_STATE;
      } else {
        put_byte(
          s2,
          (s2.gzhead.text ? 1 : 0) + (s2.gzhead.hcrc ? 2 : 0) + (!s2.gzhead.extra ? 0 : 4) + (!s2.gzhead.name ? 0 : 8) + (!s2.gzhead.comment ? 0 : 16)
        );
        put_byte(s2, s2.gzhead.time & 255);
        put_byte(s2, s2.gzhead.time >> 8 & 255);
        put_byte(s2, s2.gzhead.time >> 16 & 255);
        put_byte(s2, s2.gzhead.time >> 24 & 255);
        put_byte(s2, s2.level === 9 ? 2 : s2.strategy >= Z_HUFFMAN_ONLY || s2.level < 2 ? 4 : 0);
        put_byte(s2, s2.gzhead.os & 255);
        if (s2.gzhead.extra && s2.gzhead.extra.length) {
          put_byte(s2, s2.gzhead.extra.length & 255);
          put_byte(s2, s2.gzhead.extra.length >> 8 & 255);
        }
        if (s2.gzhead.hcrc) {
          strm.adler = crc32$2(strm.adler, s2.pending_buf, s2.pending, 0);
        }
        s2.gzindex = 0;
        s2.status = EXTRA_STATE;
      }
    } else {
      var header = Z_DEFLATED$2 + (s2.w_bits - 8 << 4) << 8;
      var level_flags = -1;
      if (s2.strategy >= Z_HUFFMAN_ONLY || s2.level < 2) {
        level_flags = 0;
      } else if (s2.level < 6) {
        level_flags = 1;
      } else if (s2.level === 6) {
        level_flags = 2;
      } else {
        level_flags = 3;
      }
      header |= level_flags << 6;
      if (s2.strstart !== 0) {
        header |= PRESET_DICT;
      }
      header += 31 - header % 31;
      s2.status = BUSY_STATE;
      putShortMSB(s2, header);
      if (s2.strstart !== 0) {
        putShortMSB(s2, strm.adler >>> 16);
        putShortMSB(s2, strm.adler & 65535);
      }
      strm.adler = 1;
    }
  }
  if (s2.status === EXTRA_STATE) {
    if (s2.gzhead.extra) {
      beg = s2.pending;
      while (s2.gzindex < (s2.gzhead.extra.length & 65535)) {
        if (s2.pending === s2.pending_buf_size) {
          if (s2.gzhead.hcrc && s2.pending > beg) {
            strm.adler = crc32$2(strm.adler, s2.pending_buf, s2.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s2.pending;
          if (s2.pending === s2.pending_buf_size) {
            break;
          }
        }
        put_byte(s2, s2.gzhead.extra[s2.gzindex] & 255);
        s2.gzindex++;
      }
      if (s2.gzhead.hcrc && s2.pending > beg) {
        strm.adler = crc32$2(strm.adler, s2.pending_buf, s2.pending - beg, beg);
      }
      if (s2.gzindex === s2.gzhead.extra.length) {
        s2.gzindex = 0;
        s2.status = NAME_STATE;
      }
    } else {
      s2.status = NAME_STATE;
    }
  }
  if (s2.status === NAME_STATE) {
    if (s2.gzhead.name) {
      beg = s2.pending;
      do {
        if (s2.pending === s2.pending_buf_size) {
          if (s2.gzhead.hcrc && s2.pending > beg) {
            strm.adler = crc32$2(strm.adler, s2.pending_buf, s2.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s2.pending;
          if (s2.pending === s2.pending_buf_size) {
            val = 1;
            break;
          }
        }
        if (s2.gzindex < s2.gzhead.name.length) {
          val = s2.gzhead.name.charCodeAt(s2.gzindex++) & 255;
        } else {
          val = 0;
        }
        put_byte(s2, val);
      } while (val !== 0);
      if (s2.gzhead.hcrc && s2.pending > beg) {
        strm.adler = crc32$2(strm.adler, s2.pending_buf, s2.pending - beg, beg);
      }
      if (val === 0) {
        s2.gzindex = 0;
        s2.status = COMMENT_STATE;
      }
    } else {
      s2.status = COMMENT_STATE;
    }
  }
  if (s2.status === COMMENT_STATE) {
    if (s2.gzhead.comment) {
      beg = s2.pending;
      do {
        if (s2.pending === s2.pending_buf_size) {
          if (s2.gzhead.hcrc && s2.pending > beg) {
            strm.adler = crc32$2(strm.adler, s2.pending_buf, s2.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s2.pending;
          if (s2.pending === s2.pending_buf_size) {
            val = 1;
            break;
          }
        }
        if (s2.gzindex < s2.gzhead.comment.length) {
          val = s2.gzhead.comment.charCodeAt(s2.gzindex++) & 255;
        } else {
          val = 0;
        }
        put_byte(s2, val);
      } while (val !== 0);
      if (s2.gzhead.hcrc && s2.pending > beg) {
        strm.adler = crc32$2(strm.adler, s2.pending_buf, s2.pending - beg, beg);
      }
      if (val === 0) {
        s2.status = HCRC_STATE;
      }
    } else {
      s2.status = HCRC_STATE;
    }
  }
  if (s2.status === HCRC_STATE) {
    if (s2.gzhead.hcrc) {
      if (s2.pending + 2 > s2.pending_buf_size) {
        flush_pending(strm);
      }
      if (s2.pending + 2 <= s2.pending_buf_size) {
        put_byte(s2, strm.adler & 255);
        put_byte(s2, strm.adler >> 8 & 255);
        strm.adler = 0;
        s2.status = BUSY_STATE;
      }
    } else {
      s2.status = BUSY_STATE;
    }
  }
  if (s2.pending !== 0) {
    flush_pending(strm);
    if (strm.avail_out === 0) {
      s2.last_flush = -1;
      return Z_OK$2;
    }
  } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH$2) {
    return err(strm, Z_BUF_ERROR$1);
  }
  if (s2.status === FINISH_STATE && strm.avail_in !== 0) {
    return err(strm, Z_BUF_ERROR$1);
  }
  if (strm.avail_in !== 0 || s2.lookahead !== 0 || flush !== Z_NO_FLUSH$1 && s2.status !== FINISH_STATE) {
    var bstate = s2.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s2, flush) : s2.strategy === Z_RLE ? deflate_rle(s2, flush) : configuration_table[s2.level].func(s2, flush);
    if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
      s2.status = FINISH_STATE;
    }
    if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
      if (strm.avail_out === 0) {
        s2.last_flush = -1;
      }
      return Z_OK$2;
    }
    if (bstate === BS_BLOCK_DONE) {
      if (flush === Z_PARTIAL_FLUSH) {
        trees._tr_align(s2);
      } else if (flush !== Z_BLOCK$1) {
        trees._tr_stored_block(s2, 0, 0, false);
        if (flush === Z_FULL_FLUSH) {
          zero(s2.head);
          if (s2.lookahead === 0) {
            s2.strstart = 0;
            s2.block_start = 0;
            s2.insert = 0;
          }
        }
      }
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s2.last_flush = -1;
        return Z_OK$2;
      }
    }
  }
  if (flush !== Z_FINISH$2) {
    return Z_OK$2;
  }
  if (s2.wrap <= 0) {
    return Z_STREAM_END$2;
  }
  if (s2.wrap === 2) {
    put_byte(s2, strm.adler & 255);
    put_byte(s2, strm.adler >> 8 & 255);
    put_byte(s2, strm.adler >> 16 & 255);
    put_byte(s2, strm.adler >> 24 & 255);
    put_byte(s2, strm.total_in & 255);
    put_byte(s2, strm.total_in >> 8 & 255);
    put_byte(s2, strm.total_in >> 16 & 255);
    put_byte(s2, strm.total_in >> 24 & 255);
  } else {
    putShortMSB(s2, strm.adler >>> 16);
    putShortMSB(s2, strm.adler & 65535);
  }
  flush_pending(strm);
  if (s2.wrap > 0) {
    s2.wrap = -s2.wrap;
  }
  return s2.pending !== 0 ? Z_OK$2 : Z_STREAM_END$2;
}
function deflateEnd(strm) {
  var status;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  status = strm.state.status;
  if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
    return err(strm, Z_STREAM_ERROR$1);
  }
  strm.state = null;
  return status === BUSY_STATE ? err(strm, Z_DATA_ERROR$1) : Z_OK$2;
}
function deflateSetDictionary(strm, dictionary) {
  var dictLength = dictionary.length;
  var s2;
  var str, n2;
  var wrap;
  var avail;
  var next;
  var input;
  var tmpDict;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  s2 = strm.state;
  wrap = s2.wrap;
  if (wrap === 2 || wrap === 1 && s2.status !== INIT_STATE || s2.lookahead) {
    return Z_STREAM_ERROR$1;
  }
  if (wrap === 1) {
    strm.adler = adler32$1(strm.adler, dictionary, dictLength, 0);
  }
  s2.wrap = 0;
  if (dictLength >= s2.w_size) {
    if (wrap === 0) {
      zero(s2.head);
      s2.strstart = 0;
      s2.block_start = 0;
      s2.insert = 0;
    }
    tmpDict = new utils$i.Buf8(s2.w_size);
    utils$i.arraySet(tmpDict, dictionary, dictLength - s2.w_size, s2.w_size, 0);
    dictionary = tmpDict;
    dictLength = s2.w_size;
  }
  avail = strm.avail_in;
  next = strm.next_in;
  input = strm.input;
  strm.avail_in = dictLength;
  strm.next_in = 0;
  strm.input = dictionary;
  fill_window(s2);
  while (s2.lookahead >= MIN_MATCH) {
    str = s2.strstart;
    n2 = s2.lookahead - (MIN_MATCH - 1);
    do {
      s2.ins_h = (s2.ins_h << s2.hash_shift ^ s2.window[str + MIN_MATCH - 1]) & s2.hash_mask;
      s2.prev[str & s2.w_mask] = s2.head[s2.ins_h];
      s2.head[s2.ins_h] = str;
      str++;
    } while (--n2);
    s2.strstart = str;
    s2.lookahead = MIN_MATCH - 1;
    fill_window(s2);
  }
  s2.strstart += s2.lookahead;
  s2.block_start = s2.strstart;
  s2.insert = s2.lookahead;
  s2.lookahead = 0;
  s2.match_length = s2.prev_length = MIN_MATCH - 1;
  s2.match_available = 0;
  strm.next_in = next;
  strm.input = input;
  strm.avail_in = avail;
  s2.wrap = wrap;
  return Z_OK$2;
}
deflate$3.deflateInit = deflateInit;
deflate$3.deflateInit2 = deflateInit2;
deflate$3.deflateReset = deflateReset;
deflate$3.deflateResetKeep = deflateResetKeep;
deflate$3.deflateSetHeader = deflateSetHeader;
deflate$3.deflate = deflate$2;
deflate$3.deflateEnd = deflateEnd;
deflate$3.deflateSetDictionary = deflateSetDictionary;
deflate$3.deflateInfo = "pako deflate (from Nodeca project)";
var strings$2 = {};
var utils$h = common;
var STR_APPLY_OK = true;
var STR_APPLY_UIA_OK = true;
try {
  String.fromCharCode.apply(null, [0]);
} catch (__) {
  STR_APPLY_OK = false;
}
try {
  String.fromCharCode.apply(null, new Uint8Array(1));
} catch (__) {
  STR_APPLY_UIA_OK = false;
}
var _utf8len = new utils$h.Buf8(256);
for (var q = 0; q < 256; q++) {
  _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
}
_utf8len[254] = _utf8len[254] = 1;
strings$2.string2buf = function(str) {
  var buf, c2, c22, m_pos, i, str_len = str.length, buf_len = 0;
  for (m_pos = 0; m_pos < str_len; m_pos++) {
    c2 = str.charCodeAt(m_pos);
    if ((c2 & 64512) === 55296 && m_pos + 1 < str_len) {
      c22 = str.charCodeAt(m_pos + 1);
      if ((c22 & 64512) === 56320) {
        c2 = 65536 + (c2 - 55296 << 10) + (c22 - 56320);
        m_pos++;
      }
    }
    buf_len += c2 < 128 ? 1 : c2 < 2048 ? 2 : c2 < 65536 ? 3 : 4;
  }
  buf = new utils$h.Buf8(buf_len);
  for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
    c2 = str.charCodeAt(m_pos);
    if ((c2 & 64512) === 55296 && m_pos + 1 < str_len) {
      c22 = str.charCodeAt(m_pos + 1);
      if ((c22 & 64512) === 56320) {
        c2 = 65536 + (c2 - 55296 << 10) + (c22 - 56320);
        m_pos++;
      }
    }
    if (c2 < 128) {
      buf[i++] = c2;
    } else if (c2 < 2048) {
      buf[i++] = 192 | c2 >>> 6;
      buf[i++] = 128 | c2 & 63;
    } else if (c2 < 65536) {
      buf[i++] = 224 | c2 >>> 12;
      buf[i++] = 128 | c2 >>> 6 & 63;
      buf[i++] = 128 | c2 & 63;
    } else {
      buf[i++] = 240 | c2 >>> 18;
      buf[i++] = 128 | c2 >>> 12 & 63;
      buf[i++] = 128 | c2 >>> 6 & 63;
      buf[i++] = 128 | c2 & 63;
    }
  }
  return buf;
};
function buf2binstring(buf, len) {
  if (len < 65534) {
    if (buf.subarray && STR_APPLY_UIA_OK || !buf.subarray && STR_APPLY_OK) {
      return String.fromCharCode.apply(null, utils$h.shrinkBuf(buf, len));
    }
  }
  var result = "";
  for (var i = 0; i < len; i++) {
    result += String.fromCharCode(buf[i]);
  }
  return result;
}
strings$2.buf2binstring = function(buf) {
  return buf2binstring(buf, buf.length);
};
strings$2.binstring2buf = function(str) {
  var buf = new utils$h.Buf8(str.length);
  for (var i = 0, len = buf.length; i < len; i++) {
    buf[i] = str.charCodeAt(i);
  }
  return buf;
};
strings$2.buf2string = function(buf, max) {
  var i, out2, c2, c_len;
  var len = max || buf.length;
  var utf16buf = new Array(len * 2);
  for (out2 = 0, i = 0; i < len; ) {
    c2 = buf[i++];
    if (c2 < 128) {
      utf16buf[out2++] = c2;
      continue;
    }
    c_len = _utf8len[c2];
    if (c_len > 4) {
      utf16buf[out2++] = 65533;
      i += c_len - 1;
      continue;
    }
    c2 &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
    while (c_len > 1 && i < len) {
      c2 = c2 << 6 | buf[i++] & 63;
      c_len--;
    }
    if (c_len > 1) {
      utf16buf[out2++] = 65533;
      continue;
    }
    if (c2 < 65536) {
      utf16buf[out2++] = c2;
    } else {
      c2 -= 65536;
      utf16buf[out2++] = 55296 | c2 >> 10 & 1023;
      utf16buf[out2++] = 56320 | c2 & 1023;
    }
  }
  return buf2binstring(utf16buf, out2);
};
strings$2.utf8border = function(buf, max) {
  var pos;
  max = max || buf.length;
  if (max > buf.length) {
    max = buf.length;
  }
  pos = max - 1;
  while (pos >= 0 && (buf[pos] & 192) === 128) {
    pos--;
  }
  if (pos < 0) {
    return max;
  }
  if (pos === 0) {
    return max;
  }
  return pos + _utf8len[buf[pos]] > max ? pos : max;
};
function ZStream$2() {
  this.input = null;
  this.next_in = 0;
  this.avail_in = 0;
  this.total_in = 0;
  this.output = null;
  this.next_out = 0;
  this.avail_out = 0;
  this.total_out = 0;
  this.msg = "";
  this.state = null;
  this.data_type = 2;
  this.adler = 0;
}
var zstream = ZStream$2;
var zlib_deflate = deflate$3;
var utils$g = common;
var strings$1 = strings$2;
var msg$1 = messages;
var ZStream$1 = zstream;
var toString$1 = Object.prototype.toString;
var Z_NO_FLUSH = 0;
var Z_FINISH$1 = 4;
var Z_OK$1 = 0;
var Z_STREAM_END$1 = 1;
var Z_SYNC_FLUSH = 2;
var Z_DEFAULT_COMPRESSION = -1;
var Z_DEFAULT_STRATEGY = 0;
var Z_DEFLATED$1 = 8;
function Deflate(options) {
  if (!(this instanceof Deflate)) return new Deflate(options);
  this.options = utils$g.assign({
    level: Z_DEFAULT_COMPRESSION,
    method: Z_DEFLATED$1,
    chunkSize: 16384,
    windowBits: 15,
    memLevel: 8,
    strategy: Z_DEFAULT_STRATEGY,
    to: ""
  }, options || {});
  var opt = this.options;
  if (opt.raw && opt.windowBits > 0) {
    opt.windowBits = -opt.windowBits;
  } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
    opt.windowBits += 16;
  }
  this.err = 0;
  this.msg = "";
  this.ended = false;
  this.chunks = [];
  this.strm = new ZStream$1();
  this.strm.avail_out = 0;
  var status = zlib_deflate.deflateInit2(
    this.strm,
    opt.level,
    opt.method,
    opt.windowBits,
    opt.memLevel,
    opt.strategy
  );
  if (status !== Z_OK$1) {
    throw new Error(msg$1[status]);
  }
  if (opt.header) {
    zlib_deflate.deflateSetHeader(this.strm, opt.header);
  }
  if (opt.dictionary) {
    var dict;
    if (typeof opt.dictionary === "string") {
      dict = strings$1.string2buf(opt.dictionary);
    } else if (toString$1.call(opt.dictionary) === "[object ArrayBuffer]") {
      dict = new Uint8Array(opt.dictionary);
    } else {
      dict = opt.dictionary;
    }
    status = zlib_deflate.deflateSetDictionary(this.strm, dict);
    if (status !== Z_OK$1) {
      throw new Error(msg$1[status]);
    }
    this._dict_set = true;
  }
}
Deflate.prototype.push = function(data, mode) {
  var strm = this.strm;
  var chunkSize = this.options.chunkSize;
  var status, _mode;
  if (this.ended) {
    return false;
  }
  _mode = mode === ~~mode ? mode : mode === true ? Z_FINISH$1 : Z_NO_FLUSH;
  if (typeof data === "string") {
    strm.input = strings$1.string2buf(data);
  } else if (toString$1.call(data) === "[object ArrayBuffer]") {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }
  strm.next_in = 0;
  strm.avail_in = strm.input.length;
  do {
    if (strm.avail_out === 0) {
      strm.output = new utils$g.Buf8(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }
    status = zlib_deflate.deflate(strm, _mode);
    if (status !== Z_STREAM_END$1 && status !== Z_OK$1) {
      this.onEnd(status);
      this.ended = true;
      return false;
    }
    if (strm.avail_out === 0 || strm.avail_in === 0 && (_mode === Z_FINISH$1 || _mode === Z_SYNC_FLUSH)) {
      if (this.options.to === "string") {
        this.onData(strings$1.buf2binstring(utils$g.shrinkBuf(strm.output, strm.next_out)));
      } else {
        this.onData(utils$g.shrinkBuf(strm.output, strm.next_out));
      }
    }
  } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== Z_STREAM_END$1);
  if (_mode === Z_FINISH$1) {
    status = zlib_deflate.deflateEnd(this.strm);
    this.onEnd(status);
    this.ended = true;
    return status === Z_OK$1;
  }
  if (_mode === Z_SYNC_FLUSH) {
    this.onEnd(Z_OK$1);
    strm.avail_out = 0;
    return true;
  }
  return true;
};
Deflate.prototype.onData = function(chunk) {
  this.chunks.push(chunk);
};
Deflate.prototype.onEnd = function(status) {
  if (status === Z_OK$1) {
    if (this.options.to === "string") {
      this.result = this.chunks.join("");
    } else {
      this.result = utils$g.flattenChunks(this.chunks);
    }
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};
function deflate$1(input, options) {
  var deflator = new Deflate(options);
  deflator.push(input, true);
  if (deflator.err) {
    throw deflator.msg || msg$1[deflator.err];
  }
  return deflator.result;
}
function deflateRaw(input, options) {
  options = options || {};
  options.raw = true;
  return deflate$1(input, options);
}
function gzip(input, options) {
  options = options || {};
  options.gzip = true;
  return deflate$1(input, options);
}
deflate$4.Deflate = Deflate;
deflate$4.deflate = deflate$1;
deflate$4.deflateRaw = deflateRaw;
deflate$4.gzip = gzip;
var inflate$4 = {};
var inflate$3 = {};
var BAD$1 = 30;
var TYPE$1 = 12;
var inffast = function inflate_fast(strm, start) {
  var state;
  var _in;
  var last;
  var _out;
  var beg;
  var end;
  var dmax;
  var wsize;
  var whave;
  var wnext;
  var s_window;
  var hold;
  var bits;
  var lcode;
  var dcode;
  var lmask;
  var dmask;
  var here;
  var op;
  var len;
  var dist;
  var from;
  var from_source;
  var input, output;
  state = strm.state;
  _in = strm.next_in;
  input = strm.input;
  last = _in + (strm.avail_in - 5);
  _out = strm.next_out;
  output = strm.output;
  beg = _out - (start - strm.avail_out);
  end = _out + (strm.avail_out - 257);
  dmax = state.dmax;
  wsize = state.wsize;
  whave = state.whave;
  wnext = state.wnext;
  s_window = state.window;
  hold = state.hold;
  bits = state.bits;
  lcode = state.lencode;
  dcode = state.distcode;
  lmask = (1 << state.lenbits) - 1;
  dmask = (1 << state.distbits) - 1;
  top:
    do {
      if (bits < 15) {
        hold += input[_in++] << bits;
        bits += 8;
        hold += input[_in++] << bits;
        bits += 8;
      }
      here = lcode[hold & lmask];
      dolen:
        for (; ; ) {
          op = here >>> 24;
          hold >>>= op;
          bits -= op;
          op = here >>> 16 & 255;
          if (op === 0) {
            output[_out++] = here & 65535;
          } else if (op & 16) {
            len = here & 65535;
            op &= 15;
            if (op) {
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
              }
              len += hold & (1 << op) - 1;
              hold >>>= op;
              bits -= op;
            }
            if (bits < 15) {
              hold += input[_in++] << bits;
              bits += 8;
              hold += input[_in++] << bits;
              bits += 8;
            }
            here = dcode[hold & dmask];
            dodist:
              for (; ; ) {
                op = here >>> 24;
                hold >>>= op;
                bits -= op;
                op = here >>> 16 & 255;
                if (op & 16) {
                  dist = here & 65535;
                  op &= 15;
                  if (bits < op) {
                    hold += input[_in++] << bits;
                    bits += 8;
                    if (bits < op) {
                      hold += input[_in++] << bits;
                      bits += 8;
                    }
                  }
                  dist += hold & (1 << op) - 1;
                  if (dist > dmax) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD$1;
                    break top;
                  }
                  hold >>>= op;
                  bits -= op;
                  op = _out - beg;
                  if (dist > op) {
                    op = dist - op;
                    if (op > whave) {
                      if (state.sane) {
                        strm.msg = "invalid distance too far back";
                        state.mode = BAD$1;
                        break top;
                      }
                    }
                    from = 0;
                    from_source = s_window;
                    if (wnext === 0) {
                      from += wsize - op;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = _out - dist;
                        from_source = output;
                      }
                    } else if (wnext < op) {
                      from += wsize + wnext - op;
                      op -= wnext;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = 0;
                        if (wnext < len) {
                          op = wnext;
                          len -= op;
                          do {
                            output[_out++] = s_window[from++];
                          } while (--op);
                          from = _out - dist;
                          from_source = output;
                        }
                      }
                    } else {
                      from += wnext - op;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = _out - dist;
                        from_source = output;
                      }
                    }
                    while (len > 2) {
                      output[_out++] = from_source[from++];
                      output[_out++] = from_source[from++];
                      output[_out++] = from_source[from++];
                      len -= 3;
                    }
                    if (len) {
                      output[_out++] = from_source[from++];
                      if (len > 1) {
                        output[_out++] = from_source[from++];
                      }
                    }
                  } else {
                    from = _out - dist;
                    do {
                      output[_out++] = output[from++];
                      output[_out++] = output[from++];
                      output[_out++] = output[from++];
                      len -= 3;
                    } while (len > 2);
                    if (len) {
                      output[_out++] = output[from++];
                      if (len > 1) {
                        output[_out++] = output[from++];
                      }
                    }
                  }
                } else if ((op & 64) === 0) {
                  here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                  continue dodist;
                } else {
                  strm.msg = "invalid distance code";
                  state.mode = BAD$1;
                  break top;
                }
                break;
              }
          } else if ((op & 64) === 0) {
            here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
            continue dolen;
          } else if (op & 32) {
            state.mode = TYPE$1;
            break top;
          } else {
            strm.msg = "invalid literal/length code";
            state.mode = BAD$1;
            break top;
          }
          break;
        }
    } while (_in < last && _out < end);
  len = bits >> 3;
  _in -= len;
  bits -= len << 3;
  hold &= (1 << bits) - 1;
  strm.next_in = _in;
  strm.next_out = _out;
  strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
  strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
  state.hold = hold;
  state.bits = bits;
  return;
};
var utils$f = common;
var MAXBITS = 15;
var ENOUGH_LENS$1 = 852;
var ENOUGH_DISTS$1 = 592;
var CODES$1 = 0;
var LENS$1 = 1;
var DISTS$1 = 2;
var lbase = [
  /* Length codes 257..285 base */
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  13,
  15,
  17,
  19,
  23,
  27,
  31,
  35,
  43,
  51,
  59,
  67,
  83,
  99,
  115,
  131,
  163,
  195,
  227,
  258,
  0,
  0
];
var lext = [
  /* Length codes 257..285 extra */
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  17,
  17,
  17,
  17,
  18,
  18,
  18,
  18,
  19,
  19,
  19,
  19,
  20,
  20,
  20,
  20,
  21,
  21,
  21,
  21,
  16,
  72,
  78
];
var dbase = [
  /* Distance codes 0..29 base */
  1,
  2,
  3,
  4,
  5,
  7,
  9,
  13,
  17,
  25,
  33,
  49,
  65,
  97,
  129,
  193,
  257,
  385,
  513,
  769,
  1025,
  1537,
  2049,
  3073,
  4097,
  6145,
  8193,
  12289,
  16385,
  24577,
  0,
  0
];
var dext = [
  /* Distance codes 0..29 extra */
  16,
  16,
  16,
  16,
  17,
  17,
  18,
  18,
  19,
  19,
  20,
  20,
  21,
  21,
  22,
  22,
  23,
  23,
  24,
  24,
  25,
  25,
  26,
  26,
  27,
  27,
  28,
  28,
  29,
  29,
  64,
  64
];
var inftrees = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
  var bits = opts.bits;
  var len = 0;
  var sym = 0;
  var min = 0, max = 0;
  var root = 0;
  var curr = 0;
  var drop = 0;
  var left = 0;
  var used = 0;
  var huff = 0;
  var incr;
  var fill;
  var low;
  var mask;
  var next;
  var base = null;
  var base_index = 0;
  var end;
  var count = new utils$f.Buf16(MAXBITS + 1);
  var offs = new utils$f.Buf16(MAXBITS + 1);
  var extra = null;
  var extra_index = 0;
  var here_bits, here_op, here_val;
  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[lens_index + sym]]++;
  }
  root = bits;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] !== 0) {
      break;
    }
  }
  if (root > max) {
    root = max;
  }
  if (max === 0) {
    table[table_index++] = 1 << 24 | 64 << 16 | 0;
    table[table_index++] = 1 << 24 | 64 << 16 | 0;
    opts.bits = 1;
    return 0;
  }
  for (min = 1; min < max; min++) {
    if (count[min] !== 0) {
      break;
    }
  }
  if (root < min) {
    root = min;
  }
  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    }
  }
  if (left > 0 && (type === CODES$1 || max !== 1)) {
    return -1;
  }
  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }
  for (sym = 0; sym < codes; sym++) {
    if (lens[lens_index + sym] !== 0) {
      work[offs[lens[lens_index + sym]]++] = sym;
    }
  }
  if (type === CODES$1) {
    base = extra = work;
    end = 19;
  } else if (type === LENS$1) {
    base = lbase;
    base_index -= 257;
    extra = lext;
    extra_index -= 257;
    end = 256;
  } else {
    base = dbase;
    extra = dext;
    end = -1;
  }
  huff = 0;
  sym = 0;
  len = min;
  next = table_index;
  curr = root;
  drop = 0;
  low = -1;
  used = 1 << root;
  mask = used - 1;
  if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
    return 1;
  }
  for (; ; ) {
    here_bits = len - drop;
    if (work[sym] < end) {
      here_op = 0;
      here_val = work[sym];
    } else if (work[sym] > end) {
      here_op = extra[extra_index + work[sym]];
      here_val = base[base_index + work[sym]];
    } else {
      here_op = 32 + 64;
      here_val = 0;
    }
    incr = 1 << len - drop;
    fill = 1 << curr;
    min = fill;
    do {
      fill -= incr;
      table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
    } while (fill !== 0);
    incr = 1 << len - 1;
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr !== 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }
    sym++;
    if (--count[len] === 0) {
      if (len === max) {
        break;
      }
      len = lens[lens_index + work[sym]];
    }
    if (len > root && (huff & mask) !== low) {
      if (drop === 0) {
        drop = root;
      }
      next += min;
      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) {
          break;
        }
        curr++;
        left <<= 1;
      }
      used += 1 << curr;
      if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) {
        return 1;
      }
      low = huff & mask;
      table[low] = root << 24 | curr << 16 | next - table_index | 0;
    }
  }
  if (huff !== 0) {
    table[next + huff] = len - drop << 24 | 64 << 16 | 0;
  }
  opts.bits = root;
  return 0;
};
var utils$e = common;
var adler32 = adler32_1;
var crc32$1 = crc32_1;
var inflate_fast2 = inffast;
var inflate_table2 = inftrees;
var CODES = 0;
var LENS = 1;
var DISTS = 2;
var Z_FINISH = 4;
var Z_BLOCK = 5;
var Z_TREES = 6;
var Z_OK = 0;
var Z_STREAM_END = 1;
var Z_NEED_DICT = 2;
var Z_STREAM_ERROR = -2;
var Z_DATA_ERROR = -3;
var Z_MEM_ERROR = -4;
var Z_BUF_ERROR = -5;
var Z_DEFLATED = 8;
var HEAD = 1;
var FLAGS = 2;
var TIME = 3;
var OS = 4;
var EXLEN = 5;
var EXTRA = 6;
var NAME = 7;
var COMMENT = 8;
var HCRC = 9;
var DICTID = 10;
var DICT = 11;
var TYPE = 12;
var TYPEDO = 13;
var STORED = 14;
var COPY_ = 15;
var COPY = 16;
var TABLE = 17;
var LENLENS = 18;
var CODELENS = 19;
var LEN_ = 20;
var LEN = 21;
var LENEXT = 22;
var DIST = 23;
var DISTEXT = 24;
var MATCH = 25;
var LIT = 26;
var CHECK = 27;
var LENGTH = 28;
var DONE = 29;
var BAD = 30;
var MEM = 31;
var SYNC = 32;
var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
var MAX_WBITS = 15;
var DEF_WBITS = MAX_WBITS;
function zswap32(q) {
  return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
}
function InflateState() {
  this.mode = 0;
  this.last = false;
  this.wrap = 0;
  this.havedict = false;
  this.flags = 0;
  this.dmax = 0;
  this.check = 0;
  this.total = 0;
  this.head = null;
  this.wbits = 0;
  this.wsize = 0;
  this.whave = 0;
  this.wnext = 0;
  this.window = null;
  this.hold = 0;
  this.bits = 0;
  this.length = 0;
  this.offset = 0;
  this.extra = 0;
  this.lencode = null;
  this.distcode = null;
  this.lenbits = 0;
  this.distbits = 0;
  this.ncode = 0;
  this.nlen = 0;
  this.ndist = 0;
  this.have = 0;
  this.next = null;
  this.lens = new utils$e.Buf16(320);
  this.work = new utils$e.Buf16(288);
  this.lendyn = null;
  this.distdyn = null;
  this.sane = 0;
  this.back = 0;
  this.was = 0;
}
function inflateResetKeep(strm) {
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  state = strm.state;
  strm.total_in = strm.total_out = state.total = 0;
  strm.msg = "";
  if (state.wrap) {
    strm.adler = state.wrap & 1;
  }
  state.mode = HEAD;
  state.last = 0;
  state.havedict = 0;
  state.dmax = 32768;
  state.head = null;
  state.hold = 0;
  state.bits = 0;
  state.lencode = state.lendyn = new utils$e.Buf32(ENOUGH_LENS);
  state.distcode = state.distdyn = new utils$e.Buf32(ENOUGH_DISTS);
  state.sane = 1;
  state.back = -1;
  return Z_OK;
}
function inflateReset(strm) {
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  state = strm.state;
  state.wsize = 0;
  state.whave = 0;
  state.wnext = 0;
  return inflateResetKeep(strm);
}
function inflateReset2(strm, windowBits) {
  var wrap;
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  state = strm.state;
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  } else {
    wrap = (windowBits >> 4) + 1;
    if (windowBits < 48) {
      windowBits &= 15;
    }
  }
  if (windowBits && (windowBits < 8 || windowBits > 15)) {
    return Z_STREAM_ERROR;
  }
  if (state.window !== null && state.wbits !== windowBits) {
    state.window = null;
  }
  state.wrap = wrap;
  state.wbits = windowBits;
  return inflateReset(strm);
}
function inflateInit2(strm, windowBits) {
  var ret;
  var state;
  if (!strm) {
    return Z_STREAM_ERROR;
  }
  state = new InflateState();
  strm.state = state;
  state.window = null;
  ret = inflateReset2(strm, windowBits);
  if (ret !== Z_OK) {
    strm.state = null;
  }
  return ret;
}
function inflateInit(strm) {
  return inflateInit2(strm, DEF_WBITS);
}
var virgin = true;
var lenfix, distfix;
function fixedtables(state) {
  if (virgin) {
    var sym;
    lenfix = new utils$e.Buf32(512);
    distfix = new utils$e.Buf32(32);
    sym = 0;
    while (sym < 144) {
      state.lens[sym++] = 8;
    }
    while (sym < 256) {
      state.lens[sym++] = 9;
    }
    while (sym < 280) {
      state.lens[sym++] = 7;
    }
    while (sym < 288) {
      state.lens[sym++] = 8;
    }
    inflate_table2(LENS, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
    sym = 0;
    while (sym < 32) {
      state.lens[sym++] = 5;
    }
    inflate_table2(DISTS, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
    virgin = false;
  }
  state.lencode = lenfix;
  state.lenbits = 9;
  state.distcode = distfix;
  state.distbits = 5;
}
function updatewindow(strm, src, end, copy) {
  var dist;
  var state = strm.state;
  if (state.window === null) {
    state.wsize = 1 << state.wbits;
    state.wnext = 0;
    state.whave = 0;
    state.window = new utils$e.Buf8(state.wsize);
  }
  if (copy >= state.wsize) {
    utils$e.arraySet(state.window, src, end - state.wsize, state.wsize, 0);
    state.wnext = 0;
    state.whave = state.wsize;
  } else {
    dist = state.wsize - state.wnext;
    if (dist > copy) {
      dist = copy;
    }
    utils$e.arraySet(state.window, src, end - copy, dist, state.wnext);
    copy -= dist;
    if (copy) {
      utils$e.arraySet(state.window, src, end - copy, copy, 0);
      state.wnext = copy;
      state.whave = state.wsize;
    } else {
      state.wnext += dist;
      if (state.wnext === state.wsize) {
        state.wnext = 0;
      }
      if (state.whave < state.wsize) {
        state.whave += dist;
      }
    }
  }
  return 0;
}
function inflate$2(strm, flush) {
  var state;
  var input, output;
  var next;
  var put;
  var have, left;
  var hold;
  var bits;
  var _in, _out;
  var copy;
  var from;
  var from_source;
  var here = 0;
  var here_bits, here_op, here_val;
  var last_bits, last_op, last_val;
  var len;
  var ret;
  var hbuf = new utils$e.Buf8(4);
  var opts;
  var n2;
  var order = (
    /* permutation of code lengths */
    [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
  );
  if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
    return Z_STREAM_ERROR;
  }
  state = strm.state;
  if (state.mode === TYPE) {
    state.mode = TYPEDO;
  }
  put = strm.next_out;
  output = strm.output;
  left = strm.avail_out;
  next = strm.next_in;
  input = strm.input;
  have = strm.avail_in;
  hold = state.hold;
  bits = state.bits;
  _in = have;
  _out = left;
  ret = Z_OK;
  inf_leave:
    for (; ; ) {
      switch (state.mode) {
        case HEAD:
          if (state.wrap === 0) {
            state.mode = TYPEDO;
            break;
          }
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.wrap & 2 && hold === 35615) {
            state.check = 0;
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32$1(state.check, hbuf, 2, 0);
            hold = 0;
            bits = 0;
            state.mode = FLAGS;
            break;
          }
          state.flags = 0;
          if (state.head) {
            state.head.done = false;
          }
          if (!(state.wrap & 1) || /* check if zlib header allowed */
          (((hold & 255) << 8) + (hold >> 8)) % 31) {
            strm.msg = "incorrect header check";
            state.mode = BAD;
            break;
          }
          if ((hold & 15) !== Z_DEFLATED) {
            strm.msg = "unknown compression method";
            state.mode = BAD;
            break;
          }
          hold >>>= 4;
          bits -= 4;
          len = (hold & 15) + 8;
          if (state.wbits === 0) {
            state.wbits = len;
          } else if (len > state.wbits) {
            strm.msg = "invalid window size";
            state.mode = BAD;
            break;
          }
          state.dmax = 1 << len;
          strm.adler = state.check = 1;
          state.mode = hold & 512 ? DICTID : TYPE;
          hold = 0;
          bits = 0;
          break;
        case FLAGS:
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.flags = hold;
          if ((state.flags & 255) !== Z_DEFLATED) {
            strm.msg = "unknown compression method";
            state.mode = BAD;
            break;
          }
          if (state.flags & 57344) {
            strm.msg = "unknown header flags set";
            state.mode = BAD;
            break;
          }
          if (state.head) {
            state.head.text = hold >> 8 & 1;
          }
          if (state.flags & 512) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32$1(state.check, hbuf, 2, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = TIME;
        case TIME:
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.head) {
            state.head.time = hold;
          }
          if (state.flags & 512) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            hbuf[2] = hold >>> 16 & 255;
            hbuf[3] = hold >>> 24 & 255;
            state.check = crc32$1(state.check, hbuf, 4, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = OS;
        case OS:
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.head) {
            state.head.xflags = hold & 255;
            state.head.os = hold >> 8;
          }
          if (state.flags & 512) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32$1(state.check, hbuf, 2, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = EXLEN;
        case EXLEN:
          if (state.flags & 1024) {
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.length = hold;
            if (state.head) {
              state.head.extra_len = hold;
            }
            if (state.flags & 512) {
              hbuf[0] = hold & 255;
              hbuf[1] = hold >>> 8 & 255;
              state.check = crc32$1(state.check, hbuf, 2, 0);
            }
            hold = 0;
            bits = 0;
          } else if (state.head) {
            state.head.extra = null;
          }
          state.mode = EXTRA;
        case EXTRA:
          if (state.flags & 1024) {
            copy = state.length;
            if (copy > have) {
              copy = have;
            }
            if (copy) {
              if (state.head) {
                len = state.head.extra_len - state.length;
                if (!state.head.extra) {
                  state.head.extra = new Array(state.head.extra_len);
                }
                utils$e.arraySet(
                  state.head.extra,
                  input,
                  next,
                  // extra field is limited to 65536 bytes
                  // - no need for additional size check
                  copy,
                  /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                  len
                );
              }
              if (state.flags & 512) {
                state.check = crc32$1(state.check, input, copy, next);
              }
              have -= copy;
              next += copy;
              state.length -= copy;
            }
            if (state.length) {
              break inf_leave;
            }
          }
          state.length = 0;
          state.mode = NAME;
        case NAME:
          if (state.flags & 2048) {
            if (have === 0) {
              break inf_leave;
            }
            copy = 0;
            do {
              len = input[next + copy++];
              if (state.head && len && state.length < 65536) {
                state.head.name += String.fromCharCode(len);
              }
            } while (len && copy < have);
            if (state.flags & 512) {
              state.check = crc32$1(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.name = null;
          }
          state.length = 0;
          state.mode = COMMENT;
        case COMMENT:
          if (state.flags & 4096) {
            if (have === 0) {
              break inf_leave;
            }
            copy = 0;
            do {
              len = input[next + copy++];
              if (state.head && len && state.length < 65536) {
                state.head.comment += String.fromCharCode(len);
              }
            } while (len && copy < have);
            if (state.flags & 512) {
              state.check = crc32$1(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.comment = null;
          }
          state.mode = HCRC;
        case HCRC:
          if (state.flags & 512) {
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (hold !== (state.check & 65535)) {
              strm.msg = "header crc mismatch";
              state.mode = BAD;
              break;
            }
            hold = 0;
            bits = 0;
          }
          if (state.head) {
            state.head.hcrc = state.flags >> 9 & 1;
            state.head.done = true;
          }
          strm.adler = state.check = 0;
          state.mode = TYPE;
          break;
        case DICTID:
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          strm.adler = state.check = zswap32(hold);
          hold = 0;
          bits = 0;
          state.mode = DICT;
        case DICT:
          if (state.havedict === 0) {
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits;
            return Z_NEED_DICT;
          }
          strm.adler = state.check = 1;
          state.mode = TYPE;
        case TYPE:
          if (flush === Z_BLOCK || flush === Z_TREES) {
            break inf_leave;
          }
        case TYPEDO:
          if (state.last) {
            hold >>>= bits & 7;
            bits -= bits & 7;
            state.mode = CHECK;
            break;
          }
          while (bits < 3) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.last = hold & 1;
          hold >>>= 1;
          bits -= 1;
          switch (hold & 3) {
            case 0:
              state.mode = STORED;
              break;
            case 1:
              fixedtables(state);
              state.mode = LEN_;
              if (flush === Z_TREES) {
                hold >>>= 2;
                bits -= 2;
                break inf_leave;
              }
              break;
            case 2:
              state.mode = TABLE;
              break;
            case 3:
              strm.msg = "invalid block type";
              state.mode = BAD;
          }
          hold >>>= 2;
          bits -= 2;
          break;
        case STORED:
          hold >>>= bits & 7;
          bits -= bits & 7;
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
            strm.msg = "invalid stored block lengths";
            state.mode = BAD;
            break;
          }
          state.length = hold & 65535;
          hold = 0;
          bits = 0;
          state.mode = COPY_;
          if (flush === Z_TREES) {
            break inf_leave;
          }
        case COPY_:
          state.mode = COPY;
        case COPY:
          copy = state.length;
          if (copy) {
            if (copy > have) {
              copy = have;
            }
            if (copy > left) {
              copy = left;
            }
            if (copy === 0) {
              break inf_leave;
            }
            utils$e.arraySet(output, input, next, copy, put);
            have -= copy;
            next += copy;
            left -= copy;
            put += copy;
            state.length -= copy;
            break;
          }
          state.mode = TYPE;
          break;
        case TABLE:
          while (bits < 14) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.nlen = (hold & 31) + 257;
          hold >>>= 5;
          bits -= 5;
          state.ndist = (hold & 31) + 1;
          hold >>>= 5;
          bits -= 5;
          state.ncode = (hold & 15) + 4;
          hold >>>= 4;
          bits -= 4;
          if (state.nlen > 286 || state.ndist > 30) {
            strm.msg = "too many length or distance symbols";
            state.mode = BAD;
            break;
          }
          state.have = 0;
          state.mode = LENLENS;
        case LENLENS:
          while (state.have < state.ncode) {
            while (bits < 3) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.lens[order[state.have++]] = hold & 7;
            hold >>>= 3;
            bits -= 3;
          }
          while (state.have < 19) {
            state.lens[order[state.have++]] = 0;
          }
          state.lencode = state.lendyn;
          state.lenbits = 7;
          opts = { bits: state.lenbits };
          ret = inflate_table2(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
          state.lenbits = opts.bits;
          if (ret) {
            strm.msg = "invalid code lengths set";
            state.mode = BAD;
            break;
          }
          state.have = 0;
          state.mode = CODELENS;
        case CODELENS:
          while (state.have < state.nlen + state.ndist) {
            for (; ; ) {
              here = state.lencode[hold & (1 << state.lenbits) - 1];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (here_val < 16) {
              hold >>>= here_bits;
              bits -= here_bits;
              state.lens[state.have++] = here_val;
            } else {
              if (here_val === 16) {
                n2 = here_bits + 2;
                while (bits < n2) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                if (state.have === 0) {
                  strm.msg = "invalid bit length repeat";
                  state.mode = BAD;
                  break;
                }
                len = state.lens[state.have - 1];
                copy = 3 + (hold & 3);
                hold >>>= 2;
                bits -= 2;
              } else if (here_val === 17) {
                n2 = here_bits + 3;
                while (bits < n2) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                len = 0;
                copy = 3 + (hold & 7);
                hold >>>= 3;
                bits -= 3;
              } else {
                n2 = here_bits + 7;
                while (bits < n2) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                len = 0;
                copy = 11 + (hold & 127);
                hold >>>= 7;
                bits -= 7;
              }
              if (state.have + copy > state.nlen + state.ndist) {
                strm.msg = "invalid bit length repeat";
                state.mode = BAD;
                break;
              }
              while (copy--) {
                state.lens[state.have++] = len;
              }
            }
          }
          if (state.mode === BAD) {
            break;
          }
          if (state.lens[256] === 0) {
            strm.msg = "invalid code -- missing end-of-block";
            state.mode = BAD;
            break;
          }
          state.lenbits = 9;
          opts = { bits: state.lenbits };
          ret = inflate_table2(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
          state.lenbits = opts.bits;
          if (ret) {
            strm.msg = "invalid literal/lengths set";
            state.mode = BAD;
            break;
          }
          state.distbits = 6;
          state.distcode = state.distdyn;
          opts = { bits: state.distbits };
          ret = inflate_table2(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
          state.distbits = opts.bits;
          if (ret) {
            strm.msg = "invalid distances set";
            state.mode = BAD;
            break;
          }
          state.mode = LEN_;
          if (flush === Z_TREES) {
            break inf_leave;
          }
        case LEN_:
          state.mode = LEN;
        case LEN:
          if (have >= 6 && left >= 258) {
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits;
            inflate_fast2(strm, _out);
            put = strm.next_out;
            output = strm.output;
            left = strm.avail_out;
            next = strm.next_in;
            input = strm.input;
            have = strm.avail_in;
            hold = state.hold;
            bits = state.bits;
            if (state.mode === TYPE) {
              state.back = -1;
            }
            break;
          }
          state.back = 0;
          for (; ; ) {
            here = state.lencode[hold & (1 << state.lenbits) - 1];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (here_bits <= bits) {
              break;
            }
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (here_op && (here_op & 240) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;
            for (; ; ) {
              here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (last_bits + here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            hold >>>= last_bits;
            bits -= last_bits;
            state.back += last_bits;
          }
          hold >>>= here_bits;
          bits -= here_bits;
          state.back += here_bits;
          state.length = here_val;
          if (here_op === 0) {
            state.mode = LIT;
            break;
          }
          if (here_op & 32) {
            state.back = -1;
            state.mode = TYPE;
            break;
          }
          if (here_op & 64) {
            strm.msg = "invalid literal/length code";
            state.mode = BAD;
            break;
          }
          state.extra = here_op & 15;
          state.mode = LENEXT;
        case LENEXT:
          if (state.extra) {
            n2 = state.extra;
            while (bits < n2) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.length += hold & (1 << state.extra) - 1;
            hold >>>= state.extra;
            bits -= state.extra;
            state.back += state.extra;
          }
          state.was = state.length;
          state.mode = DIST;
        case DIST:
          for (; ; ) {
            here = state.distcode[hold & (1 << state.distbits) - 1];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (here_bits <= bits) {
              break;
            }
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if ((here_op & 240) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;
            for (; ; ) {
              here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (last_bits + here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            hold >>>= last_bits;
            bits -= last_bits;
            state.back += last_bits;
          }
          hold >>>= here_bits;
          bits -= here_bits;
          state.back += here_bits;
          if (here_op & 64) {
            strm.msg = "invalid distance code";
            state.mode = BAD;
            break;
          }
          state.offset = here_val;
          state.extra = here_op & 15;
          state.mode = DISTEXT;
        case DISTEXT:
          if (state.extra) {
            n2 = state.extra;
            while (bits < n2) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.offset += hold & (1 << state.extra) - 1;
            hold >>>= state.extra;
            bits -= state.extra;
            state.back += state.extra;
          }
          if (state.offset > state.dmax) {
            strm.msg = "invalid distance too far back";
            state.mode = BAD;
            break;
          }
          state.mode = MATCH;
        case MATCH:
          if (left === 0) {
            break inf_leave;
          }
          copy = _out - left;
          if (state.offset > copy) {
            copy = state.offset - copy;
            if (copy > state.whave) {
              if (state.sane) {
                strm.msg = "invalid distance too far back";
                state.mode = BAD;
                break;
              }
            }
            if (copy > state.wnext) {
              copy -= state.wnext;
              from = state.wsize - copy;
            } else {
              from = state.wnext - copy;
            }
            if (copy > state.length) {
              copy = state.length;
            }
            from_source = state.window;
          } else {
            from_source = output;
            from = put - state.offset;
            copy = state.length;
          }
          if (copy > left) {
            copy = left;
          }
          left -= copy;
          state.length -= copy;
          do {
            output[put++] = from_source[from++];
          } while (--copy);
          if (state.length === 0) {
            state.mode = LEN;
          }
          break;
        case LIT:
          if (left === 0) {
            break inf_leave;
          }
          output[put++] = state.length;
          left--;
          state.mode = LEN;
          break;
        case CHECK:
          if (state.wrap) {
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold |= input[next++] << bits;
              bits += 8;
            }
            _out -= left;
            strm.total_out += _out;
            state.total += _out;
            if (_out) {
              strm.adler = state.check = /*UPDATE(state.check, put - _out, _out);*/
              state.flags ? crc32$1(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
            }
            _out = left;
            if ((state.flags ? hold : zswap32(hold)) !== state.check) {
              strm.msg = "incorrect data check";
              state.mode = BAD;
              break;
            }
            hold = 0;
            bits = 0;
          }
          state.mode = LENGTH;
        case LENGTH:
          if (state.wrap && state.flags) {
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (hold !== (state.total & 4294967295)) {
              strm.msg = "incorrect length check";
              state.mode = BAD;
              break;
            }
            hold = 0;
            bits = 0;
          }
          state.mode = DONE;
        case DONE:
          ret = Z_STREAM_END;
          break inf_leave;
        case BAD:
          ret = Z_DATA_ERROR;
          break inf_leave;
        case MEM:
          return Z_MEM_ERROR;
        case SYNC:
        default:
          return Z_STREAM_ERROR;
      }
    }
  strm.next_out = put;
  strm.avail_out = left;
  strm.next_in = next;
  strm.avail_in = have;
  state.hold = hold;
  state.bits = bits;
  if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH)) {
    if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
  }
  _in -= strm.avail_in;
  _out -= strm.avail_out;
  strm.total_in += _in;
  strm.total_out += _out;
  state.total += _out;
  if (state.wrap && _out) {
    strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
    state.flags ? crc32$1(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
  }
  strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
  if ((_in === 0 && _out === 0 || flush === Z_FINISH) && ret === Z_OK) {
    ret = Z_BUF_ERROR;
  }
  return ret;
}
function inflateEnd(strm) {
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  var state = strm.state;
  if (state.window) {
    state.window = null;
  }
  strm.state = null;
  return Z_OK;
}
function inflateGetHeader(strm, head) {
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  state = strm.state;
  if ((state.wrap & 2) === 0) {
    return Z_STREAM_ERROR;
  }
  state.head = head;
  head.done = false;
  return Z_OK;
}
function inflateSetDictionary(strm, dictionary) {
  var dictLength = dictionary.length;
  var state;
  var dictid;
  var ret;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  state = strm.state;
  if (state.wrap !== 0 && state.mode !== DICT) {
    return Z_STREAM_ERROR;
  }
  if (state.mode === DICT) {
    dictid = 1;
    dictid = adler32(dictid, dictionary, dictLength, 0);
    if (dictid !== state.check) {
      return Z_DATA_ERROR;
    }
  }
  ret = updatewindow(strm, dictionary, dictLength, dictLength);
  if (ret) {
    state.mode = MEM;
    return Z_MEM_ERROR;
  }
  state.havedict = 1;
  return Z_OK;
}
inflate$3.inflateReset = inflateReset;
inflate$3.inflateReset2 = inflateReset2;
inflate$3.inflateResetKeep = inflateResetKeep;
inflate$3.inflateInit = inflateInit;
inflate$3.inflateInit2 = inflateInit2;
inflate$3.inflate = inflate$2;
inflate$3.inflateEnd = inflateEnd;
inflate$3.inflateGetHeader = inflateGetHeader;
inflate$3.inflateSetDictionary = inflateSetDictionary;
inflate$3.inflateInfo = "pako inflate (from Nodeca project)";
var constants$1 = {
  /* Allowed flush values; see deflate() and inflate() below for details */
  Z_NO_FLUSH: 0,
  Z_PARTIAL_FLUSH: 1,
  Z_SYNC_FLUSH: 2,
  Z_FULL_FLUSH: 3,
  Z_FINISH: 4,
  Z_BLOCK: 5,
  Z_TREES: 6,
  /* Return codes for the compression/decompression functions. Negative values
  * are errors, positive values are used for special but normal events.
  */
  Z_OK: 0,
  Z_STREAM_END: 1,
  Z_NEED_DICT: 2,
  Z_ERRNO: -1,
  Z_STREAM_ERROR: -2,
  Z_DATA_ERROR: -3,
  //Z_MEM_ERROR:     -4,
  Z_BUF_ERROR: -5,
  //Z_VERSION_ERROR: -6,
  /* compression levels */
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1,
  Z_HUFFMAN_ONLY: 2,
  Z_RLE: 3,
  Z_FIXED: 4,
  Z_DEFAULT_STRATEGY: 0,
  /* Possible values of the data_type field (though see inflate()) */
  Z_BINARY: 0,
  Z_TEXT: 1,
  //Z_ASCII:                1, // = Z_TEXT (deprecated)
  Z_UNKNOWN: 2,
  /* The deflate compression method */
  Z_DEFLATED: 8
  //Z_NULL:                 null // Use -1 or null inline, depending on var type
};
function GZheader$1() {
  this.text = 0;
  this.time = 0;
  this.xflags = 0;
  this.os = 0;
  this.extra = null;
  this.extra_len = 0;
  this.name = "";
  this.comment = "";
  this.hcrc = 0;
  this.done = false;
}
var gzheader = GZheader$1;
var zlib_inflate = inflate$3;
var utils$d = common;
var strings = strings$2;
var c = constants$1;
var msg = messages;
var ZStream = zstream;
var GZheader = gzheader;
var toString = Object.prototype.toString;
function Inflate(options) {
  if (!(this instanceof Inflate)) return new Inflate(options);
  this.options = utils$d.assign({
    chunkSize: 16384,
    windowBits: 0,
    to: ""
  }, options || {});
  var opt = this.options;
  if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
    opt.windowBits = -opt.windowBits;
    if (opt.windowBits === 0) {
      opt.windowBits = -15;
    }
  }
  if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
    opt.windowBits += 32;
  }
  if (opt.windowBits > 15 && opt.windowBits < 48) {
    if ((opt.windowBits & 15) === 0) {
      opt.windowBits |= 15;
    }
  }
  this.err = 0;
  this.msg = "";
  this.ended = false;
  this.chunks = [];
  this.strm = new ZStream();
  this.strm.avail_out = 0;
  var status = zlib_inflate.inflateInit2(
    this.strm,
    opt.windowBits
  );
  if (status !== c.Z_OK) {
    throw new Error(msg[status]);
  }
  this.header = new GZheader();
  zlib_inflate.inflateGetHeader(this.strm, this.header);
  if (opt.dictionary) {
    if (typeof opt.dictionary === "string") {
      opt.dictionary = strings.string2buf(opt.dictionary);
    } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
      opt.dictionary = new Uint8Array(opt.dictionary);
    }
    if (opt.raw) {
      status = zlib_inflate.inflateSetDictionary(this.strm, opt.dictionary);
      if (status !== c.Z_OK) {
        throw new Error(msg[status]);
      }
    }
  }
}
Inflate.prototype.push = function(data, mode) {
  var strm = this.strm;
  var chunkSize = this.options.chunkSize;
  var dictionary = this.options.dictionary;
  var status, _mode;
  var next_out_utf8, tail, utf8str;
  var allowBufError = false;
  if (this.ended) {
    return false;
  }
  _mode = mode === ~~mode ? mode : mode === true ? c.Z_FINISH : c.Z_NO_FLUSH;
  if (typeof data === "string") {
    strm.input = strings.binstring2buf(data);
  } else if (toString.call(data) === "[object ArrayBuffer]") {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }
  strm.next_in = 0;
  strm.avail_in = strm.input.length;
  do {
    if (strm.avail_out === 0) {
      strm.output = new utils$d.Buf8(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }
    status = zlib_inflate.inflate(strm, c.Z_NO_FLUSH);
    if (status === c.Z_NEED_DICT && dictionary) {
      status = zlib_inflate.inflateSetDictionary(this.strm, dictionary);
    }
    if (status === c.Z_BUF_ERROR && allowBufError === true) {
      status = c.Z_OK;
      allowBufError = false;
    }
    if (status !== c.Z_STREAM_END && status !== c.Z_OK) {
      this.onEnd(status);
      this.ended = true;
      return false;
    }
    if (strm.next_out) {
      if (strm.avail_out === 0 || status === c.Z_STREAM_END || strm.avail_in === 0 && (_mode === c.Z_FINISH || _mode === c.Z_SYNC_FLUSH)) {
        if (this.options.to === "string") {
          next_out_utf8 = strings.utf8border(strm.output, strm.next_out);
          tail = strm.next_out - next_out_utf8;
          utf8str = strings.buf2string(strm.output, next_out_utf8);
          strm.next_out = tail;
          strm.avail_out = chunkSize - tail;
          if (tail) {
            utils$d.arraySet(strm.output, strm.output, next_out_utf8, tail, 0);
          }
          this.onData(utf8str);
        } else {
          this.onData(utils$d.shrinkBuf(strm.output, strm.next_out));
        }
      }
    }
    if (strm.avail_in === 0 && strm.avail_out === 0) {
      allowBufError = true;
    }
  } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== c.Z_STREAM_END);
  if (status === c.Z_STREAM_END) {
    _mode = c.Z_FINISH;
  }
  if (_mode === c.Z_FINISH) {
    status = zlib_inflate.inflateEnd(this.strm);
    this.onEnd(status);
    this.ended = true;
    return status === c.Z_OK;
  }
  if (_mode === c.Z_SYNC_FLUSH) {
    this.onEnd(c.Z_OK);
    strm.avail_out = 0;
    return true;
  }
  return true;
};
Inflate.prototype.onData = function(chunk) {
  this.chunks.push(chunk);
};
Inflate.prototype.onEnd = function(status) {
  if (status === c.Z_OK) {
    if (this.options.to === "string") {
      this.result = this.chunks.join("");
    } else {
      this.result = utils$d.flattenChunks(this.chunks);
    }
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};
function inflate$1(input, options) {
  var inflator = new Inflate(options);
  inflator.push(input, true);
  if (inflator.err) {
    throw inflator.msg || msg[inflator.err];
  }
  return inflator.result;
}
function inflateRaw(input, options) {
  options = options || {};
  options.raw = true;
  return inflate$1(input, options);
}
inflate$4.Inflate = Inflate;
inflate$4.inflate = inflate$1;
inflate$4.inflateRaw = inflateRaw;
inflate$4.ungzip = inflate$1;
var assign = common.assign;
var deflate = deflate$4;
var inflate = inflate$4;
var constants = constants$1;
var pako$1 = {};
assign(pako$1, deflate, inflate, constants);
var pako_1 = pako$1;
var USE_TYPEDARRAY = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Uint32Array !== "undefined";
var pako = pako_1;
var utils$c = requireUtils();
var GenericWorker$4 = GenericWorker_1;
var ARRAY_TYPE = USE_TYPEDARRAY ? "uint8array" : "array";
flate.magic = "\b\0";
function FlateWorker(action, options) {
  GenericWorker$4.call(this, "FlateWorker/" + action);
  this._pako = null;
  this._pakoAction = action;
  this._pakoOptions = options;
  this.meta = {};
}
utils$c.inherits(FlateWorker, GenericWorker$4);
FlateWorker.prototype.processChunk = function(chunk) {
  this.meta = chunk.meta;
  if (this._pako === null) {
    this._createPako();
  }
  this._pako.push(utils$c.transformTo(ARRAY_TYPE, chunk.data), false);
};
FlateWorker.prototype.flush = function() {
  GenericWorker$4.prototype.flush.call(this);
  if (this._pako === null) {
    this._createPako();
  }
  this._pako.push([], true);
};
FlateWorker.prototype.cleanUp = function() {
  GenericWorker$4.prototype.cleanUp.call(this);
  this._pako = null;
};
FlateWorker.prototype._createPako = function() {
  this._pako = new pako[this._pakoAction]({
    raw: true,
    level: this._pakoOptions.level || -1
    // default compression
  });
  var self2 = this;
  this._pako.onData = function(data) {
    self2.push({
      data,
      meta: self2.meta
    });
  };
};
flate.compressWorker = function(compressionOptions) {
  return new FlateWorker("Deflate", compressionOptions);
};
flate.uncompressWorker = function() {
  return new FlateWorker("Inflate", {});
};
var GenericWorker$3 = GenericWorker_1;
compressions$2.STORE = {
  magic: "\0\0",
  compressWorker: function() {
    return new GenericWorker$3("STORE compression");
  },
  uncompressWorker: function() {
    return new GenericWorker$3("STORE decompression");
  }
};
compressions$2.DEFLATE = flate;
var signature$1 = {};
signature$1.LOCAL_FILE_HEADER = "PK";
signature$1.CENTRAL_FILE_HEADER = "PK";
signature$1.CENTRAL_DIRECTORY_END = "PK";
signature$1.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07";
signature$1.ZIP64_CENTRAL_DIRECTORY_END = "PK";
signature$1.DATA_DESCRIPTOR = "PK\x07\b";
var utils$b = requireUtils();
var GenericWorker$2 = GenericWorker_1;
var utf8$3 = utf8$5;
var crc32 = crc32_1$1;
var signature = signature$1;
var decToHex = function(dec, bytes) {
  var hex = "", i;
  for (i = 0; i < bytes; i++) {
    hex += String.fromCharCode(dec & 255);
    dec = dec >>> 8;
  }
  return hex;
};
var generateUnixExternalFileAttr = function(unixPermissions, isDir) {
  var result = unixPermissions;
  if (!unixPermissions) {
    result = isDir ? 16893 : 33204;
  }
  return (result & 65535) << 16;
};
var generateDosExternalFileAttr = function(dosPermissions) {
  return (dosPermissions || 0) & 63;
};
var generateZipParts = function(streamInfo, streamedContent, streamingEnded, offset, platform, encodeFileName) {
  var file = streamInfo["file"], compression = streamInfo["compression"], useCustomEncoding = encodeFileName !== utf8$3.utf8encode, encodedFileName = utils$b.transformTo("string", encodeFileName(file.name)), utfEncodedFileName = utils$b.transformTo("string", utf8$3.utf8encode(file.name)), comment = file.comment, encodedComment = utils$b.transformTo("string", encodeFileName(comment)), utfEncodedComment = utils$b.transformTo("string", utf8$3.utf8encode(comment)), useUTF8ForFileName = utfEncodedFileName.length !== file.name.length, useUTF8ForComment = utfEncodedComment.length !== comment.length, dosTime, dosDate, extraFields = "", unicodePathExtraField = "", unicodeCommentExtraField = "", dir = file.dir, date = file.date;
  var dataInfo = {
    crc32: 0,
    compressedSize: 0,
    uncompressedSize: 0
  };
  if (!streamedContent || streamingEnded) {
    dataInfo.crc32 = streamInfo["crc32"];
    dataInfo.compressedSize = streamInfo["compressedSize"];
    dataInfo.uncompressedSize = streamInfo["uncompressedSize"];
  }
  var bitflag = 0;
  if (streamedContent) {
    bitflag |= 8;
  }
  if (!useCustomEncoding && (useUTF8ForFileName || useUTF8ForComment)) {
    bitflag |= 2048;
  }
  var extFileAttr = 0;
  var versionMadeBy = 0;
  if (dir) {
    extFileAttr |= 16;
  }
  if (platform === "UNIX") {
    versionMadeBy = 798;
    extFileAttr |= generateUnixExternalFileAttr(file.unixPermissions, dir);
  } else {
    versionMadeBy = 20;
    extFileAttr |= generateDosExternalFileAttr(file.dosPermissions);
  }
  dosTime = date.getUTCHours();
  dosTime = dosTime << 6;
  dosTime = dosTime | date.getUTCMinutes();
  dosTime = dosTime << 5;
  dosTime = dosTime | date.getUTCSeconds() / 2;
  dosDate = date.getUTCFullYear() - 1980;
  dosDate = dosDate << 4;
  dosDate = dosDate | date.getUTCMonth() + 1;
  dosDate = dosDate << 5;
  dosDate = dosDate | date.getUTCDate();
  if (useUTF8ForFileName) {
    unicodePathExtraField = // Version
    decToHex(1, 1) + // NameCRC32
    decToHex(crc32(encodedFileName), 4) + // UnicodeName
    utfEncodedFileName;
    extraFields += // Info-ZIP Unicode Path Extra Field
    "up" + // size
    decToHex(unicodePathExtraField.length, 2) + // content
    unicodePathExtraField;
  }
  if (useUTF8ForComment) {
    unicodeCommentExtraField = // Version
    decToHex(1, 1) + // CommentCRC32
    decToHex(crc32(encodedComment), 4) + // UnicodeName
    utfEncodedComment;
    extraFields += // Info-ZIP Unicode Path Extra Field
    "uc" + // size
    decToHex(unicodeCommentExtraField.length, 2) + // content
    unicodeCommentExtraField;
  }
  var header = "";
  header += "\n\0";
  header += decToHex(bitflag, 2);
  header += compression.magic;
  header += decToHex(dosTime, 2);
  header += decToHex(dosDate, 2);
  header += decToHex(dataInfo.crc32, 4);
  header += decToHex(dataInfo.compressedSize, 4);
  header += decToHex(dataInfo.uncompressedSize, 4);
  header += decToHex(encodedFileName.length, 2);
  header += decToHex(extraFields.length, 2);
  var fileRecord = signature.LOCAL_FILE_HEADER + header + encodedFileName + extraFields;
  var dirRecord = signature.CENTRAL_FILE_HEADER + // version made by (00: DOS)
  decToHex(versionMadeBy, 2) + // file header (common to file and central directory)
  header + // file comment length
  decToHex(encodedComment.length, 2) + // disk number start
  "\0\0\0\0" + // external file attributes
  decToHex(extFileAttr, 4) + // relative offset of local header
  decToHex(offset, 4) + // file name
  encodedFileName + // extra field
  extraFields + // file comment
  encodedComment;
  return {
    fileRecord,
    dirRecord
  };
};
var generateCentralDirectoryEnd = function(entriesCount, centralDirLength, localDirLength, comment, encodeFileName) {
  var dirEnd = "";
  var encodedComment = utils$b.transformTo("string", encodeFileName(comment));
  dirEnd = signature.CENTRAL_DIRECTORY_END + // number of this disk
  "\0\0\0\0" + // total number of entries in the central directory on this disk
  decToHex(entriesCount, 2) + // total number of entries in the central directory
  decToHex(entriesCount, 2) + // size of the central directory   4 bytes
  decToHex(centralDirLength, 4) + // offset of start of central directory with respect to the starting disk number
  decToHex(localDirLength, 4) + // .ZIP file comment length
  decToHex(encodedComment.length, 2) + // .ZIP file comment
  encodedComment;
  return dirEnd;
};
var generateDataDescriptors = function(streamInfo) {
  var descriptor = "";
  descriptor = signature.DATA_DESCRIPTOR + // crc-32                          4 bytes
  decToHex(streamInfo["crc32"], 4) + // compressed size                 4 bytes
  decToHex(streamInfo["compressedSize"], 4) + // uncompressed size               4 bytes
  decToHex(streamInfo["uncompressedSize"], 4);
  return descriptor;
};
function ZipFileWorker$1(streamFiles, comment, platform, encodeFileName) {
  GenericWorker$2.call(this, "ZipFileWorker");
  this.bytesWritten = 0;
  this.zipComment = comment;
  this.zipPlatform = platform;
  this.encodeFileName = encodeFileName;
  this.streamFiles = streamFiles;
  this.accumulate = false;
  this.contentBuffer = [];
  this.dirRecords = [];
  this.currentSourceOffset = 0;
  this.entriesCount = 0;
  this.currentFile = null;
  this._sources = [];
}
utils$b.inherits(ZipFileWorker$1, GenericWorker$2);
ZipFileWorker$1.prototype.push = function(chunk) {
  var currentFilePercent = chunk.meta.percent || 0;
  var entriesCount = this.entriesCount;
  var remainingFiles = this._sources.length;
  if (this.accumulate) {
    this.contentBuffer.push(chunk);
  } else {
    this.bytesWritten += chunk.data.length;
    GenericWorker$2.prototype.push.call(this, {
      data: chunk.data,
      meta: {
        currentFile: this.currentFile,
        percent: entriesCount ? (currentFilePercent + 100 * (entriesCount - remainingFiles - 1)) / entriesCount : 100
      }
    });
  }
};
ZipFileWorker$1.prototype.openedSource = function(streamInfo) {
  this.currentSourceOffset = this.bytesWritten;
  this.currentFile = streamInfo["file"].name;
  var streamedContent = this.streamFiles && !streamInfo["file"].dir;
  if (streamedContent) {
    var record = generateZipParts(streamInfo, streamedContent, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
    this.push({
      data: record.fileRecord,
      meta: { percent: 0 }
    });
  } else {
    this.accumulate = true;
  }
};
ZipFileWorker$1.prototype.closedSource = function(streamInfo) {
  this.accumulate = false;
  var streamedContent = this.streamFiles && !streamInfo["file"].dir;
  var record = generateZipParts(streamInfo, streamedContent, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
  this.dirRecords.push(record.dirRecord);
  if (streamedContent) {
    this.push({
      data: generateDataDescriptors(streamInfo),
      meta: { percent: 100 }
    });
  } else {
    this.push({
      data: record.fileRecord,
      meta: { percent: 0 }
    });
    while (this.contentBuffer.length) {
      this.push(this.contentBuffer.shift());
    }
  }
  this.currentFile = null;
};
ZipFileWorker$1.prototype.flush = function() {
  var localDirLength = this.bytesWritten;
  for (var i = 0; i < this.dirRecords.length; i++) {
    this.push({
      data: this.dirRecords[i],
      meta: { percent: 100 }
    });
  }
  var centralDirLength = this.bytesWritten - localDirLength;
  var dirEnd = generateCentralDirectoryEnd(this.dirRecords.length, centralDirLength, localDirLength, this.zipComment, this.encodeFileName);
  this.push({
    data: dirEnd,
    meta: { percent: 100 }
  });
};
ZipFileWorker$1.prototype.prepareNextSource = function() {
  this.previous = this._sources.shift();
  this.openedSource(this.previous.streamInfo);
  if (this.isPaused) {
    this.previous.pause();
  } else {
    this.previous.resume();
  }
};
ZipFileWorker$1.prototype.registerPrevious = function(previous) {
  this._sources.push(previous);
  var self2 = this;
  previous.on("data", function(chunk) {
    self2.processChunk(chunk);
  });
  previous.on("end", function() {
    self2.closedSource(self2.previous.streamInfo);
    if (self2._sources.length) {
      self2.prepareNextSource();
    } else {
      self2.end();
    }
  });
  previous.on("error", function(e2) {
    self2.error(e2);
  });
  return this;
};
ZipFileWorker$1.prototype.resume = function() {
  if (!GenericWorker$2.prototype.resume.call(this)) {
    return false;
  }
  if (!this.previous && this._sources.length) {
    this.prepareNextSource();
    return true;
  }
  if (!this.previous && !this._sources.length && !this.generatedError) {
    this.end();
    return true;
  }
};
ZipFileWorker$1.prototype.error = function(e2) {
  var sources = this._sources;
  if (!GenericWorker$2.prototype.error.call(this, e2)) {
    return false;
  }
  for (var i = 0; i < sources.length; i++) {
    try {
      sources[i].error(e2);
    } catch (e3) {
    }
  }
  return true;
};
ZipFileWorker$1.prototype.lock = function() {
  GenericWorker$2.prototype.lock.call(this);
  var sources = this._sources;
  for (var i = 0; i < sources.length; i++) {
    sources[i].lock();
  }
};
var ZipFileWorker_1 = ZipFileWorker$1;
var compressions$1 = compressions$2;
var ZipFileWorker = ZipFileWorker_1;
var getCompression = function(fileCompression, zipCompression) {
  var compressionName = fileCompression || zipCompression;
  var compression = compressions$1[compressionName];
  if (!compression) {
    throw new Error(compressionName + " is not a valid compression method !");
  }
  return compression;
};
generate$1.generateWorker = function(zip, options, comment) {
  var zipFileWorker = new ZipFileWorker(options.streamFiles, comment, options.platform, options.encodeFileName);
  var entriesCount = 0;
  try {
    zip.forEach(function(relativePath, file) {
      entriesCount++;
      var compression = getCompression(file.options.compression, options.compression);
      var compressionOptions = file.options.compressionOptions || options.compressionOptions || {};
      var dir = file.dir, date = file.date;
      file._compressWorker(compression, compressionOptions).withStreamInfo("file", {
        name: relativePath,
        dir,
        date,
        comment: file.comment || "",
        unixPermissions: file.unixPermissions,
        dosPermissions: file.dosPermissions
      }).pipe(zipFileWorker);
    });
    zipFileWorker.entriesCount = entriesCount;
  } catch (e2) {
    zipFileWorker.error(e2);
  }
  return zipFileWorker;
};
var utils$a = requireUtils();
var GenericWorker$1 = GenericWorker_1;
function NodejsStreamInputAdapter$1(filename, stream2) {
  GenericWorker$1.call(this, "Nodejs stream input adapter for " + filename);
  this._upstreamEnded = false;
  this._bindStream(stream2);
}
utils$a.inherits(NodejsStreamInputAdapter$1, GenericWorker$1);
NodejsStreamInputAdapter$1.prototype._bindStream = function(stream2) {
  var self2 = this;
  this._stream = stream2;
  stream2.pause();
  stream2.on("data", function(chunk) {
    self2.push({
      data: chunk,
      meta: {
        percent: 0
      }
    });
  }).on("error", function(e2) {
    if (self2.isPaused) {
      this.generatedError = e2;
    } else {
      self2.error(e2);
    }
  }).on("end", function() {
    if (self2.isPaused) {
      self2._upstreamEnded = true;
    } else {
      self2.end();
    }
  });
};
NodejsStreamInputAdapter$1.prototype.pause = function() {
  if (!GenericWorker$1.prototype.pause.call(this)) {
    return false;
  }
  this._stream.pause();
  return true;
};
NodejsStreamInputAdapter$1.prototype.resume = function() {
  if (!GenericWorker$1.prototype.resume.call(this)) {
    return false;
  }
  if (this._upstreamEnded) {
    this.end();
  } else {
    this._stream.resume();
  }
  return true;
};
var NodejsStreamInputAdapter_1 = NodejsStreamInputAdapter$1;
var utf8$2 = utf8$5;
var utils$9 = requireUtils();
var GenericWorker = GenericWorker_1;
var StreamHelper = StreamHelper_1;
var defaults = defaults$1;
var CompressedObject$1 = compressedObject;
var ZipObject = zipObject;
var generate = generate$1;
var nodejsUtils$1 = nodejsUtils$2;
var NodejsStreamInputAdapter = NodejsStreamInputAdapter_1;
var fileAdd = function(name, data, originalOptions) {
  var dataType = utils$9.getTypeOf(data), parent;
  var o2 = utils$9.extend(originalOptions || {}, defaults);
  o2.date = o2.date || /* @__PURE__ */ new Date();
  if (o2.compression !== null) {
    o2.compression = o2.compression.toUpperCase();
  }
  if (typeof o2.unixPermissions === "string") {
    o2.unixPermissions = parseInt(o2.unixPermissions, 8);
  }
  if (o2.unixPermissions && o2.unixPermissions & 16384) {
    o2.dir = true;
  }
  if (o2.dosPermissions && o2.dosPermissions & 16) {
    o2.dir = true;
  }
  if (o2.dir) {
    name = forceTrailingSlash(name);
  }
  if (o2.createFolders && (parent = parentFolder(name))) {
    folderAdd.call(this, parent, true);
  }
  var isUnicodeString = dataType === "string" && o2.binary === false && o2.base64 === false;
  if (!originalOptions || typeof originalOptions.binary === "undefined") {
    o2.binary = !isUnicodeString;
  }
  var isCompressedEmpty = data instanceof CompressedObject$1 && data.uncompressedSize === 0;
  if (isCompressedEmpty || o2.dir || !data || data.length === 0) {
    o2.base64 = false;
    o2.binary = true;
    data = "";
    o2.compression = "STORE";
    dataType = "string";
  }
  var zipObjectContent = null;
  if (data instanceof CompressedObject$1 || data instanceof GenericWorker) {
    zipObjectContent = data;
  } else if (nodejsUtils$1.isNode && nodejsUtils$1.isStream(data)) {
    zipObjectContent = new NodejsStreamInputAdapter(name, data);
  } else {
    zipObjectContent = utils$9.prepareContent(name, data, o2.binary, o2.optimizedBinaryString, o2.base64);
  }
  var object2 = new ZipObject(name, zipObjectContent, o2);
  this.files[name] = object2;
};
var parentFolder = function(path) {
  if (path.slice(-1) === "/") {
    path = path.substring(0, path.length - 1);
  }
  var lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.substring(0, lastSlash) : "";
};
var forceTrailingSlash = function(path) {
  if (path.slice(-1) !== "/") {
    path += "/";
  }
  return path;
};
var folderAdd = function(name, createFolders) {
  createFolders = typeof createFolders !== "undefined" ? createFolders : defaults.createFolders;
  name = forceTrailingSlash(name);
  if (!this.files[name]) {
    fileAdd.call(this, name, null, {
      dir: true,
      createFolders
    });
  }
  return this.files[name];
};
function isRegExp(object2) {
  return Object.prototype.toString.call(object2) === "[object RegExp]";
}
var out = {
  /**
   * @see loadAsync
   */
  load: function() {
    throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
  },
  /**
   * Call a callback function for each entry at this folder level.
   * @param {Function} cb the callback function:
   * function (relativePath, file) {...}
   * It takes 2 arguments : the relative path and the file.
   */
  forEach: function(cb) {
    var filename, relativePath, file;
    for (filename in this.files) {
      file = this.files[filename];
      relativePath = filename.slice(this.root.length, filename.length);
      if (relativePath && filename.slice(0, this.root.length) === this.root) {
        cb(relativePath, file);
      }
    }
  },
  /**
   * Filter nested files/folders with the specified function.
   * @param {Function} search the predicate to use :
   * function (relativePath, file) {...}
   * It takes 2 arguments : the relative path and the file.
   * @return {Array} An array of matching elements.
   */
  filter: function(search) {
    var result = [];
    this.forEach(function(relativePath, entry) {
      if (search(relativePath, entry)) {
        result.push(entry);
      }
    });
    return result;
  },
  /**
   * Add a file to the zip file, or search a file.
   * @param   {string|RegExp} name The name of the file to add (if data is defined),
   * the name of the file to find (if no data) or a regex to match files.
   * @param   {String|ArrayBuffer|Uint8Array|Buffer} data  The file data, either raw or base64 encoded
   * @param   {Object} o     File options
   * @return  {JSZip|Object|Array} this JSZip object (when adding a file),
   * a file (when searching by string) or an array of files (when searching by regex).
   */
  file: function(name, data, o2) {
    if (arguments.length === 1) {
      if (isRegExp(name)) {
        var regexp = name;
        return this.filter(function(relativePath, file) {
          return !file.dir && regexp.test(relativePath);
        });
      } else {
        var obj = this.files[this.root + name];
        if (obj && !obj.dir) {
          return obj;
        } else {
          return null;
        }
      }
    } else {
      name = this.root + name;
      fileAdd.call(this, name, data, o2);
    }
    return this;
  },
  /**
   * Add a directory to the zip file, or search.
   * @param   {String|RegExp} arg The name of the directory to add, or a regex to search folders.
   * @return  {JSZip} an object with the new directory as the root, or an array containing matching folders.
   */
  folder: function(arg) {
    if (!arg) {
      return this;
    }
    if (isRegExp(arg)) {
      return this.filter(function(relativePath, file) {
        return file.dir && arg.test(relativePath);
      });
    }
    var name = this.root + arg;
    var newFolder = folderAdd.call(this, name);
    var ret = this.clone();
    ret.root = newFolder.name;
    return ret;
  },
  /**
   * Delete a file, or a directory and all sub-files, from the zip
   * @param {string} name the name of the file to delete
   * @return {JSZip} this JSZip object
   */
  remove: function(name) {
    name = this.root + name;
    var file = this.files[name];
    if (!file) {
      if (name.slice(-1) !== "/") {
        name += "/";
      }
      file = this.files[name];
    }
    if (file && !file.dir) {
      delete this.files[name];
    } else {
      var kids = this.filter(function(relativePath, file2) {
        return file2.name.slice(0, name.length) === name;
      });
      for (var i = 0; i < kids.length; i++) {
        delete this.files[kids[i].name];
      }
    }
    return this;
  },
  /**
   * @deprecated This method has been removed in JSZip 3.0, please check the upgrade guide.
   */
  generate: function() {
    throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
  },
  /**
   * Generate the complete zip file as an internal stream.
   * @param {Object} options the options to generate the zip file :
   * - compression, "STORE" by default.
   * - type, "base64" by default. Values are : string, base64, uint8array, arraybuffer, blob.
   * @return {StreamHelper} the streamed zip file.
   */
  generateInternalStream: function(options) {
    var worker, opts = {};
    try {
      opts = utils$9.extend(options || {}, {
        streamFiles: false,
        compression: "STORE",
        compressionOptions: null,
        type: "",
        platform: "DOS",
        comment: null,
        mimeType: "application/zip",
        encodeFileName: utf8$2.utf8encode
      });
      opts.type = opts.type.toLowerCase();
      opts.compression = opts.compression.toUpperCase();
      if (opts.type === "binarystring") {
        opts.type = "string";
      }
      if (!opts.type) {
        throw new Error("No output type specified.");
      }
      utils$9.checkSupport(opts.type);
      if (opts.platform === "darwin" || opts.platform === "freebsd" || opts.platform === "linux" || opts.platform === "sunos") {
        opts.platform = "UNIX";
      }
      if (opts.platform === "win32") {
        opts.platform = "DOS";
      }
      var comment = opts.comment || this.comment || "";
      worker = generate.generateWorker(this, opts, comment);
    } catch (e2) {
      worker = new GenericWorker("error");
      worker.error(e2);
    }
    return new StreamHelper(worker, opts.type || "string", opts.mimeType);
  },
  /**
   * Generate the complete zip file asynchronously.
   * @see generateInternalStream
   */
  generateAsync: function(options, onUpdate) {
    return this.generateInternalStream(options).accumulate(onUpdate);
  },
  /**
   * Generate the complete zip file asynchronously.
   * @see generateInternalStream
   */
  generateNodeStream: function(options, onUpdate) {
    options = options || {};
    if (!options.type) {
      options.type = "nodebuffer";
    }
    return this.generateInternalStream(options).toNodejsStream(onUpdate);
  }
};
var object = out;
var utils$8 = requireUtils();
function DataReader$2(data) {
  this.data = data;
  this.length = data.length;
  this.index = 0;
  this.zero = 0;
}
DataReader$2.prototype = {
  /**
   * Check that the offset will not go too far.
   * @param {string} offset the additional offset to check.
   * @throws {Error} an Error if the offset is out of bounds.
   */
  checkOffset: function(offset) {
    this.checkIndex(this.index + offset);
  },
  /**
   * Check that the specified index will not be too far.
   * @param {string} newIndex the index to check.
   * @throws {Error} an Error if the index is out of bounds.
   */
  checkIndex: function(newIndex) {
    if (this.length < this.zero + newIndex || newIndex < 0) {
      throw new Error("End of data reached (data length = " + this.length + ", asked index = " + newIndex + "). Corrupted zip ?");
    }
  },
  /**
   * Change the index.
   * @param {number} newIndex The new index.
   * @throws {Error} if the new index is out of the data.
   */
  setIndex: function(newIndex) {
    this.checkIndex(newIndex);
    this.index = newIndex;
  },
  /**
   * Skip the next n bytes.
   * @param {number} n the number of bytes to skip.
   * @throws {Error} if the new index is out of the data.
   */
  skip: function(n2) {
    this.setIndex(this.index + n2);
  },
  /**
   * Get the byte at the specified index.
   * @param {number} i the index to use.
   * @return {number} a byte.
   */
  byteAt: function() {
  },
  /**
   * Get the next number with a given byte size.
   * @param {number} size the number of bytes to read.
   * @return {number} the corresponding number.
   */
  readInt: function(size) {
    var result = 0, i;
    this.checkOffset(size);
    for (i = this.index + size - 1; i >= this.index; i--) {
      result = (result << 8) + this.byteAt(i);
    }
    this.index += size;
    return result;
  },
  /**
   * Get the next string with a given byte size.
   * @param {number} size the number of bytes to read.
   * @return {string} the corresponding string.
   */
  readString: function(size) {
    return utils$8.transformTo("string", this.readData(size));
  },
  /**
   * Get raw data without conversion, <size> bytes.
   * @param {number} size the number of bytes to read.
   * @return {Object} the raw data, implementation specific.
   */
  readData: function() {
  },
  /**
   * Find the last occurrence of a zip signature (4 bytes).
   * @param {string} sig the signature to find.
   * @return {number} the index of the last occurrence, -1 if not found.
   */
  lastIndexOfSignature: function() {
  },
  /**
   * Read the signature (4 bytes) at the current position and compare it with sig.
   * @param {string} sig the expected signature
   * @return {boolean} true if the signature matches, false otherwise.
   */
  readAndCheckSignature: function() {
  },
  /**
   * Get the next date.
   * @return {Date} the date.
   */
  readDate: function() {
    var dostime = this.readInt(4);
    return new Date(Date.UTC(
      (dostime >> 25 & 127) + 1980,
      // year
      (dostime >> 21 & 15) - 1,
      // month
      dostime >> 16 & 31,
      // day
      dostime >> 11 & 31,
      // hour
      dostime >> 5 & 63,
      // minute
      (dostime & 31) << 1
    ));
  }
};
var DataReader_1 = DataReader$2;
var DataReader$1 = DataReader_1;
var utils$7 = requireUtils();
function ArrayReader$2(data) {
  DataReader$1.call(this, data);
  for (var i = 0; i < this.data.length; i++) {
    data[i] = data[i] & 255;
  }
}
utils$7.inherits(ArrayReader$2, DataReader$1);
ArrayReader$2.prototype.byteAt = function(i) {
  return this.data[this.zero + i];
};
ArrayReader$2.prototype.lastIndexOfSignature = function(sig2) {
  var sig0 = sig2.charCodeAt(0), sig1 = sig2.charCodeAt(1), sig22 = sig2.charCodeAt(2), sig3 = sig2.charCodeAt(3);
  for (var i = this.length - 4; i >= 0; --i) {
    if (this.data[i] === sig0 && this.data[i + 1] === sig1 && this.data[i + 2] === sig22 && this.data[i + 3] === sig3) {
      return i - this.zero;
    }
  }
  return -1;
};
ArrayReader$2.prototype.readAndCheckSignature = function(sig2) {
  var sig0 = sig2.charCodeAt(0), sig1 = sig2.charCodeAt(1), sig22 = sig2.charCodeAt(2), sig3 = sig2.charCodeAt(3), data = this.readData(4);
  return sig0 === data[0] && sig1 === data[1] && sig22 === data[2] && sig3 === data[3];
};
ArrayReader$2.prototype.readData = function(size) {
  this.checkOffset(size);
  if (size === 0) {
    return [];
  }
  var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
  this.index += size;
  return result;
};
var ArrayReader_1 = ArrayReader$2;
var DataReader = DataReader_1;
var utils$6 = requireUtils();
function StringReader$1(data) {
  DataReader.call(this, data);
}
utils$6.inherits(StringReader$1, DataReader);
StringReader$1.prototype.byteAt = function(i) {
  return this.data.charCodeAt(this.zero + i);
};
StringReader$1.prototype.lastIndexOfSignature = function(sig2) {
  return this.data.lastIndexOf(sig2) - this.zero;
};
StringReader$1.prototype.readAndCheckSignature = function(sig2) {
  var data = this.readData(4);
  return sig2 === data;
};
StringReader$1.prototype.readData = function(size) {
  this.checkOffset(size);
  var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
  this.index += size;
  return result;
};
var StringReader_1 = StringReader$1;
var ArrayReader$1 = ArrayReader_1;
var utils$5 = requireUtils();
function Uint8ArrayReader$2(data) {
  ArrayReader$1.call(this, data);
}
utils$5.inherits(Uint8ArrayReader$2, ArrayReader$1);
Uint8ArrayReader$2.prototype.readData = function(size) {
  this.checkOffset(size);
  if (size === 0) {
    return new Uint8Array(0);
  }
  var result = this.data.subarray(this.zero + this.index, this.zero + this.index + size);
  this.index += size;
  return result;
};
var Uint8ArrayReader_1 = Uint8ArrayReader$2;
var Uint8ArrayReader$1 = Uint8ArrayReader_1;
var utils$4 = requireUtils();
function NodeBufferReader$1(data) {
  Uint8ArrayReader$1.call(this, data);
}
utils$4.inherits(NodeBufferReader$1, Uint8ArrayReader$1);
NodeBufferReader$1.prototype.readData = function(size) {
  this.checkOffset(size);
  var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
  this.index += size;
  return result;
};
var NodeBufferReader_1 = NodeBufferReader$1;
var utils$3 = requireUtils();
var support$2 = support$4;
var ArrayReader = ArrayReader_1;
var StringReader = StringReader_1;
var NodeBufferReader = NodeBufferReader_1;
var Uint8ArrayReader = Uint8ArrayReader_1;
var readerFor$2 = function(data) {
  var type = utils$3.getTypeOf(data);
  utils$3.checkSupport(type);
  if (type === "string" && !support$2.uint8array) {
    return new StringReader(data);
  }
  if (type === "nodebuffer") {
    return new NodeBufferReader(data);
  }
  if (support$2.uint8array) {
    return new Uint8ArrayReader(utils$3.transformTo("uint8array", data));
  }
  return new ArrayReader(utils$3.transformTo("array", data));
};
var readerFor$1 = readerFor$2;
var utils$2 = requireUtils();
var CompressedObject = compressedObject;
var crc32fn = crc32_1$1;
var utf8$1 = utf8$5;
var compressions = compressions$2;
var support$1 = support$4;
var MADE_BY_DOS = 0;
var MADE_BY_UNIX = 3;
var findCompression = function(compressionMethod) {
  for (var method in compressions) {
    if (!Object.prototype.hasOwnProperty.call(compressions, method)) {
      continue;
    }
    if (compressions[method].magic === compressionMethod) {
      return compressions[method];
    }
  }
  return null;
};
function ZipEntry$1(options, loadOptions) {
  this.options = options;
  this.loadOptions = loadOptions;
}
ZipEntry$1.prototype = {
  /**
   * say if the file is encrypted.
   * @return {boolean} true if the file is encrypted, false otherwise.
   */
  isEncrypted: function() {
    return (this.bitFlag & 1) === 1;
  },
  /**
   * say if the file has utf-8 filename/comment.
   * @return {boolean} true if the filename/comment is in utf-8, false otherwise.
   */
  useUTF8: function() {
    return (this.bitFlag & 2048) === 2048;
  },
  /**
   * Read the local part of a zip file and add the info in this object.
   * @param {DataReader} reader the reader to use.
   */
  readLocalPart: function(reader) {
    var compression, localExtraFieldsLength;
    reader.skip(22);
    this.fileNameLength = reader.readInt(2);
    localExtraFieldsLength = reader.readInt(2);
    this.fileName = reader.readData(this.fileNameLength);
    reader.skip(localExtraFieldsLength);
    if (this.compressedSize === -1 || this.uncompressedSize === -1) {
      throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
    }
    compression = findCompression(this.compressionMethod);
    if (compression === null) {
      throw new Error("Corrupted zip : compression " + utils$2.pretty(this.compressionMethod) + " unknown (inner file : " + utils$2.transformTo("string", this.fileName) + ")");
    }
    this.decompressed = new CompressedObject(this.compressedSize, this.uncompressedSize, this.crc32, compression, reader.readData(this.compressedSize));
  },
  /**
   * Read the central part of a zip file and add the info in this object.
   * @param {DataReader} reader the reader to use.
   */
  readCentralPart: function(reader) {
    this.versionMadeBy = reader.readInt(2);
    reader.skip(2);
    this.bitFlag = reader.readInt(2);
    this.compressionMethod = reader.readString(2);
    this.date = reader.readDate();
    this.crc32 = reader.readInt(4);
    this.compressedSize = reader.readInt(4);
    this.uncompressedSize = reader.readInt(4);
    var fileNameLength = reader.readInt(2);
    this.extraFieldsLength = reader.readInt(2);
    this.fileCommentLength = reader.readInt(2);
    this.diskNumberStart = reader.readInt(2);
    this.internalFileAttributes = reader.readInt(2);
    this.externalFileAttributes = reader.readInt(4);
    this.localHeaderOffset = reader.readInt(4);
    if (this.isEncrypted()) {
      throw new Error("Encrypted zip are not supported");
    }
    reader.skip(fileNameLength);
    this.readExtraFields(reader);
    this.parseZIP64ExtraField(reader);
    this.fileComment = reader.readData(this.fileCommentLength);
  },
  /**
   * Parse the external file attributes and get the unix/dos permissions.
   */
  processAttributes: function() {
    this.unixPermissions = null;
    this.dosPermissions = null;
    var madeBy = this.versionMadeBy >> 8;
    this.dir = this.externalFileAttributes & 16 ? true : false;
    if (madeBy === MADE_BY_DOS) {
      this.dosPermissions = this.externalFileAttributes & 63;
    }
    if (madeBy === MADE_BY_UNIX) {
      this.unixPermissions = this.externalFileAttributes >> 16 & 65535;
    }
    if (!this.dir && this.fileNameStr.slice(-1) === "/") {
      this.dir = true;
    }
  },
  /**
   * Parse the ZIP64 extra field and merge the info in the current ZipEntry.
   * @param {DataReader} reader the reader to use.
   */
  parseZIP64ExtraField: function() {
    if (!this.extraFields[1]) {
      return;
    }
    var extraReader = readerFor$1(this.extraFields[1].value);
    if (this.uncompressedSize === utils$2.MAX_VALUE_32BITS) {
      this.uncompressedSize = extraReader.readInt(8);
    }
    if (this.compressedSize === utils$2.MAX_VALUE_32BITS) {
      this.compressedSize = extraReader.readInt(8);
    }
    if (this.localHeaderOffset === utils$2.MAX_VALUE_32BITS) {
      this.localHeaderOffset = extraReader.readInt(8);
    }
    if (this.diskNumberStart === utils$2.MAX_VALUE_32BITS) {
      this.diskNumberStart = extraReader.readInt(4);
    }
  },
  /**
   * Read the central part of a zip file and add the info in this object.
   * @param {DataReader} reader the reader to use.
   */
  readExtraFields: function(reader) {
    var end = reader.index + this.extraFieldsLength, extraFieldId, extraFieldLength, extraFieldValue;
    if (!this.extraFields) {
      this.extraFields = {};
    }
    while (reader.index + 4 < end) {
      extraFieldId = reader.readInt(2);
      extraFieldLength = reader.readInt(2);
      extraFieldValue = reader.readData(extraFieldLength);
      this.extraFields[extraFieldId] = {
        id: extraFieldId,
        length: extraFieldLength,
        value: extraFieldValue
      };
    }
    reader.setIndex(end);
  },
  /**
   * Apply an UTF8 transformation if needed.
   */
  handleUTF8: function() {
    var decodeParamType = support$1.uint8array ? "uint8array" : "array";
    if (this.useUTF8()) {
      this.fileNameStr = utf8$1.utf8decode(this.fileName);
      this.fileCommentStr = utf8$1.utf8decode(this.fileComment);
    } else {
      var upath = this.findExtraFieldUnicodePath();
      if (upath !== null) {
        this.fileNameStr = upath;
      } else {
        var fileNameByteArray = utils$2.transformTo(decodeParamType, this.fileName);
        this.fileNameStr = this.loadOptions.decodeFileName(fileNameByteArray);
      }
      var ucomment = this.findExtraFieldUnicodeComment();
      if (ucomment !== null) {
        this.fileCommentStr = ucomment;
      } else {
        var commentByteArray = utils$2.transformTo(decodeParamType, this.fileComment);
        this.fileCommentStr = this.loadOptions.decodeFileName(commentByteArray);
      }
    }
  },
  /**
   * Find the unicode path declared in the extra field, if any.
   * @return {String} the unicode path, null otherwise.
   */
  findExtraFieldUnicodePath: function() {
    var upathField = this.extraFields[28789];
    if (upathField) {
      var extraReader = readerFor$1(upathField.value);
      if (extraReader.readInt(1) !== 1) {
        return null;
      }
      if (crc32fn(this.fileName) !== extraReader.readInt(4)) {
        return null;
      }
      return utf8$1.utf8decode(extraReader.readData(upathField.length - 5));
    }
    return null;
  },
  /**
   * Find the unicode comment declared in the extra field, if any.
   * @return {String} the unicode comment, null otherwise.
   */
  findExtraFieldUnicodeComment: function() {
    var ucommentField = this.extraFields[25461];
    if (ucommentField) {
      var extraReader = readerFor$1(ucommentField.value);
      if (extraReader.readInt(1) !== 1) {
        return null;
      }
      if (crc32fn(this.fileComment) !== extraReader.readInt(4)) {
        return null;
      }
      return utf8$1.utf8decode(extraReader.readData(ucommentField.length - 5));
    }
    return null;
  }
};
var zipEntry = ZipEntry$1;
var readerFor = readerFor$2;
var utils$1 = requireUtils();
var sig = signature$1;
var ZipEntry = zipEntry;
var support = support$4;
function ZipEntries$1(loadOptions) {
  this.files = [];
  this.loadOptions = loadOptions;
}
ZipEntries$1.prototype = {
  /**
   * Check that the reader is on the specified signature.
   * @param {string} expectedSignature the expected signature.
   * @throws {Error} if it is an other signature.
   */
  checkSignature: function(expectedSignature) {
    if (!this.reader.readAndCheckSignature(expectedSignature)) {
      this.reader.index -= 4;
      var signature2 = this.reader.readString(4);
      throw new Error("Corrupted zip or bug: unexpected signature (" + utils$1.pretty(signature2) + ", expected " + utils$1.pretty(expectedSignature) + ")");
    }
  },
  /**
   * Check if the given signature is at the given index.
   * @param {number} askedIndex the index to check.
   * @param {string} expectedSignature the signature to expect.
   * @return {boolean} true if the signature is here, false otherwise.
   */
  isSignature: function(askedIndex, expectedSignature) {
    var currentIndex = this.reader.index;
    this.reader.setIndex(askedIndex);
    var signature2 = this.reader.readString(4);
    var result = signature2 === expectedSignature;
    this.reader.setIndex(currentIndex);
    return result;
  },
  /**
   * Read the end of the central directory.
   */
  readBlockEndOfCentral: function() {
    this.diskNumber = this.reader.readInt(2);
    this.diskWithCentralDirStart = this.reader.readInt(2);
    this.centralDirRecordsOnThisDisk = this.reader.readInt(2);
    this.centralDirRecords = this.reader.readInt(2);
    this.centralDirSize = this.reader.readInt(4);
    this.centralDirOffset = this.reader.readInt(4);
    this.zipCommentLength = this.reader.readInt(2);
    var zipComment = this.reader.readData(this.zipCommentLength);
    var decodeParamType = support.uint8array ? "uint8array" : "array";
    var decodeContent = utils$1.transformTo(decodeParamType, zipComment);
    this.zipComment = this.loadOptions.decodeFileName(decodeContent);
  },
  /**
   * Read the end of the Zip 64 central directory.
   * Not merged with the method readEndOfCentral :
   * The end of central can coexist with its Zip64 brother,
   * I don't want to read the wrong number of bytes !
   */
  readBlockZip64EndOfCentral: function() {
    this.zip64EndOfCentralSize = this.reader.readInt(8);
    this.reader.skip(4);
    this.diskNumber = this.reader.readInt(4);
    this.diskWithCentralDirStart = this.reader.readInt(4);
    this.centralDirRecordsOnThisDisk = this.reader.readInt(8);
    this.centralDirRecords = this.reader.readInt(8);
    this.centralDirSize = this.reader.readInt(8);
    this.centralDirOffset = this.reader.readInt(8);
    this.zip64ExtensibleData = {};
    var extraDataSize = this.zip64EndOfCentralSize - 44, index2 = 0, extraFieldId, extraFieldLength, extraFieldValue;
    while (index2 < extraDataSize) {
      extraFieldId = this.reader.readInt(2);
      extraFieldLength = this.reader.readInt(4);
      extraFieldValue = this.reader.readData(extraFieldLength);
      this.zip64ExtensibleData[extraFieldId] = {
        id: extraFieldId,
        length: extraFieldLength,
        value: extraFieldValue
      };
    }
  },
  /**
   * Read the end of the Zip 64 central directory locator.
   */
  readBlockZip64EndOfCentralLocator: function() {
    this.diskWithZip64CentralDirStart = this.reader.readInt(4);
    this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8);
    this.disksCount = this.reader.readInt(4);
    if (this.disksCount > 1) {
      throw new Error("Multi-volumes zip are not supported");
    }
  },
  /**
   * Read the local files, based on the offset read in the central part.
   */
  readLocalFiles: function() {
    var i, file;
    for (i = 0; i < this.files.length; i++) {
      file = this.files[i];
      this.reader.setIndex(file.localHeaderOffset);
      this.checkSignature(sig.LOCAL_FILE_HEADER);
      file.readLocalPart(this.reader);
      file.handleUTF8();
      file.processAttributes();
    }
  },
  /**
   * Read the central directory.
   */
  readCentralDir: function() {
    var file;
    this.reader.setIndex(this.centralDirOffset);
    while (this.reader.readAndCheckSignature(sig.CENTRAL_FILE_HEADER)) {
      file = new ZipEntry({
        zip64: this.zip64
      }, this.loadOptions);
      file.readCentralPart(this.reader);
      this.files.push(file);
    }
    if (this.centralDirRecords !== this.files.length) {
      if (this.centralDirRecords !== 0 && this.files.length === 0) {
        throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
      }
    }
  },
  /**
   * Read the end of central directory.
   */
  readEndOfCentral: function() {
    var offset = this.reader.lastIndexOfSignature(sig.CENTRAL_DIRECTORY_END);
    if (offset < 0) {
      var isGarbage = !this.isSignature(0, sig.LOCAL_FILE_HEADER);
      if (isGarbage) {
        throw new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");
      } else {
        throw new Error("Corrupted zip: can't find end of central directory");
      }
    }
    this.reader.setIndex(offset);
    var endOfCentralDirOffset = offset;
    this.checkSignature(sig.CENTRAL_DIRECTORY_END);
    this.readBlockEndOfCentral();
    if (this.diskNumber === utils$1.MAX_VALUE_16BITS || this.diskWithCentralDirStart === utils$1.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === utils$1.MAX_VALUE_16BITS || this.centralDirRecords === utils$1.MAX_VALUE_16BITS || this.centralDirSize === utils$1.MAX_VALUE_32BITS || this.centralDirOffset === utils$1.MAX_VALUE_32BITS) {
      this.zip64 = true;
      offset = this.reader.lastIndexOfSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
      if (offset < 0) {
        throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
      }
      this.reader.setIndex(offset);
      this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
      this.readBlockZip64EndOfCentralLocator();
      if (!this.isSignature(this.relativeOffsetEndOfZip64CentralDir, sig.ZIP64_CENTRAL_DIRECTORY_END)) {
        this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(sig.ZIP64_CENTRAL_DIRECTORY_END);
        if (this.relativeOffsetEndOfZip64CentralDir < 0) {
          throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
        }
      }
      this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir);
      this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_END);
      this.readBlockZip64EndOfCentral();
    }
    var expectedEndOfCentralDirOffset = this.centralDirOffset + this.centralDirSize;
    if (this.zip64) {
      expectedEndOfCentralDirOffset += 20;
      expectedEndOfCentralDirOffset += 12 + this.zip64EndOfCentralSize;
    }
    var extraBytes = endOfCentralDirOffset - expectedEndOfCentralDirOffset;
    if (extraBytes > 0) {
      if (this.isSignature(endOfCentralDirOffset, sig.CENTRAL_FILE_HEADER)) ;
      else {
        this.reader.zero = extraBytes;
      }
    } else if (extraBytes < 0) {
      throw new Error("Corrupted zip: missing " + Math.abs(extraBytes) + " bytes.");
    }
  },
  prepareReader: function(data) {
    this.reader = readerFor(data);
  },
  /**
   * Read a zip file and create ZipEntries.
   * @param {String|ArrayBuffer|Uint8Array|Buffer} data the binary string representing a zip file.
   */
  load: function(data) {
    this.prepareReader(data);
    this.readEndOfCentral();
    this.readCentralDir();
    this.readLocalFiles();
  }
};
var zipEntries = ZipEntries$1;
var utils = requireUtils();
var external = external$3;
var utf8 = utf8$5;
var ZipEntries = zipEntries;
var Crc32Probe = Crc32Probe_1;
var nodejsUtils = nodejsUtils$2;
function checkEntryCRC32(zipEntry2) {
  return new external.Promise(function(resolve, reject) {
    var worker = zipEntry2.decompressed.getContentWorker().pipe(new Crc32Probe());
    worker.on("error", function(e2) {
      reject(e2);
    }).on("end", function() {
      if (worker.streamInfo.crc32 !== zipEntry2.decompressed.crc32) {
        reject(new Error("Corrupted zip : CRC32 mismatch"));
      } else {
        resolve();
      }
    }).resume();
  });
}
var load = function(data, options) {
  var zip = this;
  options = utils.extend(options || {}, {
    base64: false,
    checkCRC32: false,
    optimizedBinaryString: false,
    createFolders: false,
    decodeFileName: utf8.utf8decode
  });
  if (nodejsUtils.isNode && nodejsUtils.isStream(data)) {
    return external.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file."));
  }
  return utils.prepareContent("the loaded zip file", data, true, options.optimizedBinaryString, options.base64).then(function(data2) {
    var zipEntries2 = new ZipEntries(options);
    zipEntries2.load(data2);
    return zipEntries2;
  }).then(function checkCRC32(zipEntries2) {
    var promises = [external.Promise.resolve(zipEntries2)];
    var files = zipEntries2.files;
    if (options.checkCRC32) {
      for (var i = 0; i < files.length; i++) {
        promises.push(checkEntryCRC32(files[i]));
      }
    }
    return external.Promise.all(promises);
  }).then(function addFiles(results) {
    var zipEntries2 = results.shift();
    var files = zipEntries2.files;
    for (var i = 0; i < files.length; i++) {
      var input = files[i];
      var unsafeName = input.fileNameStr;
      var safeName = utils.resolve(input.fileNameStr);
      zip.file(safeName, input.decompressed, {
        binary: true,
        optimizedBinaryString: true,
        date: input.date,
        dir: input.dir,
        comment: input.fileCommentStr.length ? input.fileCommentStr : null,
        unixPermissions: input.unixPermissions,
        dosPermissions: input.dosPermissions,
        createFolders: options.createFolders
      });
      if (!input.dir) {
        zip.file(safeName).unsafeOriginalName = unsafeName;
      }
    }
    if (zipEntries2.zipComment.length) {
      zip.comment = zipEntries2.zipComment;
    }
    return zip;
  });
};
function JSZip() {
  if (!(this instanceof JSZip)) {
    return new JSZip();
  }
  if (arguments.length) {
    throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
  }
  this.files = /* @__PURE__ */ Object.create(null);
  this.comment = null;
  this.root = "";
  this.clone = function() {
    var newObj = new JSZip();
    for (var i in this) {
      if (typeof this[i] !== "function") {
        newObj[i] = this[i];
      }
    }
    return newObj;
  };
}
JSZip.prototype = object;
JSZip.prototype.loadAsync = load;
JSZip.support = support$4;
JSZip.defaults = defaults$1;
JSZip.version = "3.10.1";
JSZip.loadAsync = function(content, options) {
  return new JSZip().loadAsync(content, options);
};
JSZip.external = external$3;
var lib = JSZip;
const index = /* @__PURE__ */ getDefaultExportFromCjs(lib);
const index$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: index
}, Symbol.toStringTag, { value: "Module" }));
export {
  alignWorkScansToBite,
  setHpsJpegDecoder
};
