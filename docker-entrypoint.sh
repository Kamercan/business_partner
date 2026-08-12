#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
#  Başlatma betiği
#
#  Kalıcı disk (Railway Volume, docker -v, Kubernetes PVC) çoğu platformda
#  root sahipliğinde bağlanır. Uygulama yetkisiz kullanıcı olarak çalışırsa
#  veritabanını yazamaz ve açılışta çöker. Bu betik root ise:
#    1. veri dizinini oluşturur ve sahipliğini uygulama kullanıcısına verir,
#    2. yetkiyi düşürerek uygulamayı başlatır.
#
#  Yetki düşürülemezse uygulama root olarak çalışmaya devam eder — kalıcı
#  diskle ilgili bir izin sorunu yüzünden servisin hiç açılmaması,
#  root çalışmasından daha kötüdür.
# ─────────────────────────────────────────────────────────────────────────────
set -e

DATA_PATH="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_PATH"
  chown -R node:node "$DATA_PATH" 2>/dev/null || true

  # setpriv util-linux ile birlikte gelir; exec kullandığı için PID 1 kalır
  # ve SIGTERM doğrudan uygulamaya ulaşır (düzgün kapanma korunur).
  if command -v setpriv >/dev/null 2>&1 && id node >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  fi

  echo "⚠  Yetki düşürülemedi (setpriv veya node kullanıcısı yok) — root olarak çalışılacak."
fi

exec "$@"
