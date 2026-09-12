import assert from 'node:assert/strict';
import { buildSicarCustomerTextFields } from './sicarCustomerFields.mjs';

const longAddress = `${'Residencial San Martin '.repeat(8)}| Ref: Porton azul frente al parque`;
const fields = buildSicarCustomerTextFields({
  fullAddress: longAddress,
  commentPrefix: 'Cliente tienda virtual',
});

assert.ok(fields.domicilio.length <= 120, 'domicilio debe respetar VARCHAR(120) de SICAR');
assert.ok(fields.comentario.length <= 255, 'comentario debe respetar VARCHAR(255) de SICAR');
assert.match(fields.comentario, /Cliente tienda virtual/);
assert.match(fields.comentario, /Ref: Porton azul frente al parque/);
assert.ok(fields.overflow.length > 0, 'el excedente de la direccion debe conservarse');

const shortFields = buildSicarCustomerTextFields({
  fullAddress: 'Calle principal | Ref: Casa roja',
  commentPrefix: 'Cliente tienda virtual',
});

assert.equal(shortFields.domicilio, 'Calle principal');
assert.equal(shortFields.reference, 'Casa roja');
assert.equal(shortFields.comentario, 'Cliente tienda virtual | Ref: Casa roja');

console.log('SICAR customer field tests passed.');
