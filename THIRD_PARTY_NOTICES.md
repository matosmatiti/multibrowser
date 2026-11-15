# Сторонние компоненты (Third-party notices)

MultiBrowser использует и поставляет в установщике открытые программы. Права на них принадлежат их авторам, действуют их лицензии. Исходный код каждого компонента доступен в его репозитории.

| Компонент | Назначение | Источник |
|---|---|---|
| Electron и Chromium | движок и оболочка браузера | https://github.com/electron/electron , https://www.chromium.org |
| electron-builder, electron-updater | сборка установщика и обновления | https://github.com/electron-userland/electron-builder |
| fingerprint-chromium (на базе ungoogled-chromium) | усиленный режим, подмена отпечатка | https://github.com/adryfish/fingerprint-chromium , https://github.com/ungoogled-software/ungoogled-chromium |
| sing-box (SagerNet), GPL-3.0 с дополнением об использовании названия | подключения: прокси с логином, WireGuard | https://github.com/SagerNet/sing-box |
| sing-box-lx (форк sing-box), GPL-3.0 | подключения AmneziaWG | https://github.com/Leadaxe/sing-box-lx |
| @ghostery/adblocker, MPL-2.0 | блокировка рекламы и трекеров | https://github.com/ghostery/adblocker |
| Списки блокировки (StevenBlack/hosts, Peter Lowe's list, EasyList и др.) | данные для блокировщика | https://github.com/StevenBlack/hosts , https://pgl.yoyo.org/adservers/ |

Внешние службы, к которым обращается программа: GitHub (обновления), ipinfo.io (проверка IP и страна профиля), переводчики Microsoft Edge и Google (перевод страниц, только по запросу пользователя), Ghostery CDN (фильтры), Chrome Web Store (скачивание расширений по запросу).
