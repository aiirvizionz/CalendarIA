
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ensureAccessToken } = require('../src/services/google');

function expiredSession() {
  return {accessToken:'old-access',refreshToken:'stored-refresh',accessTokenExpiresAt:Date.now()-1,user:{sub:'test-user'},csrfToken:'test-csrf'};
}
function response(payload,status=200) {
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
}
test('Google renueva automáticamente el acceso expirado y conserva el refresh token', async(t)=>{
  const previous=global.fetch;
  t.after(()=>{global.fetch=previous;});
  global.fetch=async(url,options)=>{
    assert.match(String(url),/oauth2.googleapis.com\/token/);
    assert.equal(options.method,'POST');
    assert.equal(new URLSearchParams(options.body).get('grant_type'),'refresh_token');
    return response({access_token:'new-access',expires_in:3600});
  };
  const outcome=await ensureAccessToken(expiredSession());
  assert.equal(outcome.accessToken,'new-access');
  assert.equal(outcome.session.refreshToken,'stored-refresh');
  assert.ok(outcome.session.accessTokenExpiresAt>Date.now()+3000000);
  assert.equal(outcome.refreshed,true);
});
test('un refresh token revocado requiere una nueva conexión de Google', async(t)=>{
  const previous=global.fetch;
  t.after(()=>{global.fetch=previous;});
  global.fetch=async()=>response({error:'invalid_grant'},400);
  await assert.rejects(ensureAccessToken(expiredSession()),error=>{
    assert.equal(error.code,'GOOGLE_AUTH_EXPIRED');
    assert.equal(error.statusCode,401);
    return true;
  });
});
test('una interrupción de Google no invalida permanentemente la sesión', async(t)=>{
  const previous=global.fetch;
  t.after(()=>{global.fetch=previous;});
  global.fetch=async()=>response({error:'server_error'},503);
  await assert.rejects(ensureAccessToken(expiredSession()),error=>{
    assert.equal(error.code,'GOOGLE_REFRESH_UNAVAILABLE');
    assert.equal(error.statusCode,503);
    return true;
  });
});
test('el servidor invalida las cookies si Calendar API también rechaza el token',()=>{
  const source=fs.readFileSync(require.resolve('../server'),'utf8');
  assert.match(source,/error\?\.code === 'GOOGLE_AUTH_EXPIRED'[\s\S]*clearSession\(req, res\);[\s\S]*clearGoogleGrant\(res\);/);
});
