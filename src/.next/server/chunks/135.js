((exports.id = 135),
  (exports.ids = [135]),
  (exports.modules = {
    174: (a, b, c) => {
      (Promise.resolve().then(c.t.bind(c, 6698, 23)),
        Promise.resolve().then(c.t.bind(c, 1189, 23)),
        Promise.resolve().then(c.t.bind(c, 1285, 23)),
        Promise.resolve().then(c.t.bind(c, 5692, 23)),
        Promise.resolve().then(c.t.bind(c, 2628, 23)),
        Promise.resolve().then(c.t.bind(c, 7176, 23)),
        Promise.resolve().then(c.t.bind(c, 6032, 23)),
        Promise.resolve().then(c.t.bind(c, 553, 23)),
        Promise.resolve().then(c.t.bind(c, 5472, 23)));
    },
    920: (a, b, c) => {
      "use strict";
      function d() {
        throw Object.defineProperty(
          Error(
            "`unauthorized()` is experimental and only allowed to be used when `experimental.authInterrupts` is enabled.",
          ),
          "__NEXT_ERROR_CODE",
          { value: "E411", enumerable: !1, configurable: !0 },
        );
      }
      (Object.defineProperty(b, "__esModule", { value: !0 }),
        Object.defineProperty(b, "unauthorized", {
          enumerable: !0,
          get: function () {
            return d;
          },
        }),
        c(3429).HTTP_ERROR_FALLBACK_ERROR_CODE,
        ("function" == typeof b.default ||
          ("object" == typeof b.default && null !== b.default)) &&
          void 0 === b.default.__esModule &&
          (Object.defineProperty(b.default, "__esModule", { value: !0 }),
          Object.assign(b.default, b),
          (a.exports = b.default)));
    },
    982: (a, b, c) => {
      "use strict";
      (Object.defineProperty(b, "__esModule", { value: !0 }),
        !(function (a, b) {
          for (var c in b)
            Object.defineProperty(a, c, { enumerable: !0, get: b[c] });
        })(b, {
          getRedirectError: function () {
            return g;
          },
          getRedirectStatusCodeFromError: function () {
            return l;
          },
          getRedirectTypeFromError: function () {
            return k;
          },
          getURLFromRedirectError: function () {
            return j;
          },
          permanentRedirect: function () {
            return i;
          },
          redirect: function () {
            return h;
          },
        }));
      let d = c(4011),
        e = c(1541),
        f = c(9121).actionAsyncStorage;
      function g(a, b, c) {
        void 0 === c && (c = d.RedirectStatusCode.TemporaryRedirect);
        let f = Object.defineProperty(
          Error(e.REDIRECT_ERROR_CODE),
          "__NEXT_ERROR_CODE",
          { value: "E394", enumerable: !1, configurable: !0 },
        );
        return (
          (f.digest =
            e.REDIRECT_ERROR_CODE + ";" + b + ";" + a + ";" + c + ";"),
          f
        );
      }
      function h(a, b) {
        var c;
        throw (
          null != b ||
            (b = (null == f || null == (c = f.getStore()) ? void 0 : c.isAction)
              ? e.RedirectType.push
              : e.RedirectType.replace),
          g(a, b, d.RedirectStatusCode.TemporaryRedirect)
        );
      }
      function i(a, b) {
        throw (
          void 0 === b && (b = e.RedirectType.replace),
          g(a, b, d.RedirectStatusCode.PermanentRedirect)
        );
      }
      function j(a) {
        return (0, e.isRedirectError)(a)
          ? a.digest.split(";").slice(2, -2).join(";")
          : null;
      }
      function k(a) {
        if (!(0, e.isRedirectError)(a))
          throw Object.defineProperty(
            Error("Not a redirect error"),
            "__NEXT_ERROR_CODE",
            { value: "E260", enumerable: !1, configurable: !0 },
          );
        return a.digest.split(";", 2)[1];
      }
      function l(a) {
        if (!(0, e.isRedirectError)(a))
          throw Object.defineProperty(
            Error("Not a redirect error"),
            "__NEXT_ERROR_CODE",
            { value: "E260", enumerable: !1, configurable: !0 },
          );
        return Number(a.digest.split(";").at(-2));
      }
      ("function" == typeof b.default ||
        ("object" == typeof b.default && null !== b.default)) &&
        void 0 === b.default.__esModule &&
        (Object.defineProperty(b.default, "__esModule", { value: !0 }),
        Object.assign(b.default, b),
        (a.exports = b.default));
    },
    1077: (a, b, c) => {
      "use strict";
      (c.r(b), c.d(b, { default: () => e }));
      var d = c(5387);
      let e = async (a) => [
        {
          type: "image/x-icon",
          sizes: "16x16",
          url:
            (0, d.fillMetadataSegment)(".", await a.params, "favicon.ico") + "",
        },
      ];
    },
    2060: (a, b, c) => {
      "use strict";
      (Object.defineProperty(b, "__esModule", { value: !0 }),
        Object.defineProperty(b, "notFound", {
          enumerable: !0,
          get: function () {
            return e;
          },
        }));
      let d = "" + c(3429).HTTP_ERROR_FALLBACK_ERROR_CODE + ";404";
      function e() {
        let a = Object.defineProperty(Error(d), "__NEXT_ERROR_CODE", {
          value: "E394",
          enumerable: !1,
          configurable: !0,
        });
        throw ((a.digest = d), a);
      }
      ("function" == typeof b.default ||
        ("object" == typeof b.default && null !== b.default)) &&
        void 0 === b.default.__esModule &&
        (Object.defineProperty(b.default, "__esModule", { value: !0 }),
        Object.assign(b.default, b),
        (a.exports = b.default));
    },
    2782: () => {},
    3222: (a, b, c) => {
      (Promise.resolve().then(c.t.bind(c, 2220, 23)),
        Promise.resolve().then(c.t.bind(c, 415, 23)),
        Promise.resolve().then(c.t.bind(c, 99, 23)),
        Promise.resolve().then(c.t.bind(c, 2086, 23)),
        Promise.resolve().then(c.t.bind(c, 946, 23)),
        Promise.resolve().then(c.t.bind(c, 8118, 23)),
        Promise.resolve().then(c.t.bind(c, 4166, 23)),
        Promise.resolve().then(c.t.bind(c, 8499, 23)),
        Promise.resolve().then(c.bind(c, 7094)));
    },
    3369: (a, b, c) => {
      "use strict";
      var d = c(6653);
      c.o(d, "notFound") &&
        c.d(b, {
          notFound: function () {
            return d.notFound;
          },
        });
    },
    4429: () => {},
    4749: () => {},
    4944: (a, b, c) => {
      "use strict";
      (Object.defineProperty(b, "__esModule", { value: !0 }),
        Object.defineProperty(b, "unstable_rethrow", {
          enumerable: !0,
          get: function () {
            return d;
          },
        }));
      let d = c(7695).unstable_rethrow;
      ("function" == typeof b.default ||
        ("object" == typeof b.default && null !== b.default)) &&
        void 0 === b.default.__esModule &&
        (Object.defineProperty(b.default, "__esModule", { value: !0 }),
        Object.assign(b.default, b),
        (a.exports = b.default));
    },
    5562: (a, b, c) => {
      "use strict";
      (c.r(b), c.d(b, { default: () => j, metadata: () => i }));
      var d = c(7586),
        e = c(6823),
        f = c.n(e),
        g = c(1630),
        h = c.n(g);
      (c(7190),
        (function () {
          var a = Error("Cannot find module '@/components/layout/Header'");
          throw ((a.code = "MODULE_NOT_FOUND"), a);
        })(),
        (function () {
          var a = Error("Cannot find module '@/components/layout/Footer'");
          throw ((a.code = "MODULE_NOT_FOUND"), a);
        })());
      let i = {
        title: "Create Next App",
        description: "Generated by create next app",
      };
      function j({ children: a }) {
        return (0, d.jsx)("html", {
          lang: "en",
          children: (0, d.jsx)("body", {
            className: `${f().variable} ${h().variable} antialiased`,
            children: (0, d.jsxs)("main", {
              className: "bg-stone-100 text-gray-800 min-h-screen",
              children: [
                (0, d.jsx)(
                  Object(
                    (function () {
                      var a = Error(
                        "Cannot find module '@/components/layout/Header'",
                      );
                      throw ((a.code = "MODULE_NOT_FOUND"), a);
                    })(),
                  ),
                  {},
                ),
                a,
                (0, d.jsx)(
                  Object(
                    (function () {
                      var a = Error(
                        "Cannot find module '@/components/layout/Footer'",
                      );
                      throw ((a.code = "MODULE_NOT_FOUND"), a);
                    })(),
                  ),
                  {},
                ),
              ],
            }),
          }),
        });
      }
    },
    6653: (a, b, c) => {
      "use strict";
      (Object.defineProperty(b, "__esModule", { value: !0 }),
        !(function (a, b) {
          for (var c in b)
            Object.defineProperty(a, c, { enumerable: !0, get: b[c] });
        })(b, {
          ReadonlyURLSearchParams: function () {
            return k;
          },
          RedirectType: function () {
            return e.RedirectType;
          },
          forbidden: function () {
            return g.forbidden;
          },
          notFound: function () {
            return f.notFound;
          },
          permanentRedirect: function () {
            return d.permanentRedirect;
          },
          redirect: function () {
            return d.redirect;
          },
          unauthorized: function () {
            return h.unauthorized;
          },
          unstable_isUnrecognizedActionError: function () {
            return l;
          },
          unstable_rethrow: function () {
            return i.unstable_rethrow;
          },
        }));
      let d = c(982),
        e = c(1541),
        f = c(2060),
        g = c(8725),
        h = c(920),
        i = c(4944);
      class j extends Error {
        constructor() {
          super(
            "Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams",
          );
        }
      }
      class k extends URLSearchParams {
        append() {
          throw new j();
        }
        delete() {
          throw new j();
        }
        set() {
          throw new j();
        }
        sort() {
          throw new j();
        }
      }
      function l() {
        throw Object.defineProperty(
          Error(
            "`unstable_isUnrecognizedActionError` can only be used on the client.",
          ),
          "__NEXT_ERROR_CODE",
          { value: "E776", enumerable: !1, configurable: !0 },
        );
      }
      ("function" == typeof b.default ||
        ("object" == typeof b.default && null !== b.default)) &&
        void 0 === b.default.__esModule &&
        (Object.defineProperty(b.default, "__esModule", { value: !0 }),
        Object.assign(b.default, b),
        (a.exports = b.default));
    },
    7190: () => {},
    7510: () => {},
    7695: (a, b, c) => {
      "use strict";
      (Object.defineProperty(b, "__esModule", { value: !0 }),
        Object.defineProperty(b, "unstable_rethrow", {
          enumerable: !0,
          get: function () {
            return function a(b) {
              if (
                (0, g.isNextRouterError)(b) ||
                (0, f.isBailoutToCSRError)(b) ||
                (0, i.isDynamicServerError)(b) ||
                (0, h.isDynamicPostpone)(b) ||
                (0, e.isPostpone)(b) ||
                (0, d.isHangingPromiseRejectionError)(b)
              )
                throw b;
              b instanceof Error && "cause" in b && a(b.cause);
            };
          },
        }));
      let d = c(4423),
        e = c(1972),
        f = c(4817),
        g = c(8261),
        h = c(850),
        i = c(1432);
      ("function" == typeof b.default ||
        ("object" == typeof b.default && null !== b.default)) &&
        void 0 === b.default.__esModule &&
        (Object.defineProperty(b.default, "__esModule", { value: !0 }),
        Object.assign(b.default, b),
        (a.exports = b.default));
    },
    8725: (a, b, c) => {
      "use strict";
      function d() {
        throw Object.defineProperty(
          Error(
            "`forbidden()` is experimental and only allowed to be enabled when `experimental.authInterrupts` is enabled.",
          ),
          "__NEXT_ERROR_CODE",
          { value: "E488", enumerable: !1, configurable: !0 },
        );
      }
      (Object.defineProperty(b, "__esModule", { value: !0 }),
        Object.defineProperty(b, "forbidden", {
          enumerable: !0,
          get: function () {
            return d;
          },
        }),
        c(3429).HTTP_ERROR_FALLBACK_ERROR_CODE,
        ("function" == typeof b.default ||
          ("object" == typeof b.default && null !== b.default)) &&
          void 0 === b.default.__esModule &&
          (Object.defineProperty(b.default, "__esModule", { value: !0 }),
          Object.assign(b.default, b),
          (a.exports = b.default)));
    },
  }));
