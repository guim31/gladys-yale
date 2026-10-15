// -----------------------------------------------------------------------------
// The clouds of the Yale Home / August platform, as yalexs (MIT) describes
// them (yalexs/const.py, and the Yale Home configuration it dropped in
// June 2026, commit 389ae6c).
//
//   yale_home    Yale Home (ASSA ABLOY), Europe and the rest of the world:
//                api.aaecosystem.com, x-* headers.
//   yale_access  Yale Access (Fortune Brands, United States): the August
//                cloud with the Yale branding.
//   august       August (United States): api-production.august.com.
//
// The application keys below are the public ones the apps shipped and yalexs
// published. Both clouds may refuse them now (yalexs README: Yale Home
// accepts partner keys only since January 2025, August too); the user can
// type another key in the configuration. The values stored in the
// configuration (`brand`) are permanent: never rename one.
// -----------------------------------------------------------------------------

const AUGUST_HEADERS = {
  token: 'x-august-access-token',
  apiKey: 'x-august-api-key',
  branding: 'x-august-branding',
};

const AUGUST_PUBNUB = 'sub-c-1030e062-0ebe-11e5-a5c2-0619f8945a4f';

export const BRANDS = Object.freeze({
  yale_home: Object.freeze({
    key: 'yale_home',
    name: 'Yale Home',
    baseUrl: 'https://api.aaecosystem.com',
    headers: { token: 'x-access-token', apiKey: 'x-api-key', branding: 'x-branding' },
    branding: 'yale',
    apiKey: '6e2a2093-6118-42c5-8a41-e1fd25dce7a1',
    pubnubSubscribeKey: 'sub-c-c9c38d4d-5796-46c9-9262-af20cf6a1d42',
  }),
  yale_access: Object.freeze({
    key: 'yale_access',
    name: 'Yale Access',
    baseUrl: 'https://api-production.august.com',
    headers: AUGUST_HEADERS,
    branding: 'yale',
    apiKey: 'd9984f29-07a6-816e-e1c9-44ec9d1be431',
    pubnubSubscribeKey: AUGUST_PUBNUB,
  }),
  august: Object.freeze({
    key: 'august',
    name: 'August',
    baseUrl: 'https://api-production.august.com',
    headers: AUGUST_HEADERS,
    branding: 'august',
    apiKey: 'd9984f29-07a6-816e-e1c9-44ec9d1be431',
    pubnubSubscribeKey: AUGUST_PUBNUB,
  }),
});

export const BRAND_KEYS = Object.keys(BRANDS);

/** The brand of a configuration value, Yale Home when unknown. */
export const brandOf = (key) => BRANDS[key] ?? BRANDS.yale_home;
