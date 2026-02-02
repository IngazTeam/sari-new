#!/bin/bash

#===============================================================================
# 🚀 Sari Auto-Deploy Script (Advanced)
# 
# سكربت نشر متقدم مع نسخ احتياطي وتراجع ولوجات
# 
# الاستخدام:
#   ./deploy-advanced.sh              # نشر عادي
#   ./deploy-advanced.sh --force      # نشر مع تجاهل التغييرات المحلية
#   ./deploy-advanced.sh --rollback   # العودة للنسخة السابقة
#   ./deploy-advanced.sh --status     # عرض حالة التطبيق
#
# ضع هذا الملف في: /var/www/sari/scripts/deploy-advanced.sh
# ثم: chmod +x deploy-advanced.sh
#===============================================================================

set -e  # إيقاف عند أي خطأ

# =====================
# الإعدادات - عدّلها حسب سيرفرك
# =====================
APP_DIR="/var/www/sari"
LOG_FILE="/var/log/sari/deploy.log"
BACKUP_DIR="/var/www/sari-backups"
PM2_APP_NAME="sari"
BRANCH="main"
HEALTH_URL="http://localhost:3000"

# =====================
# الألوان للرسائل
# =====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# =====================
# الدوال المساعدة
# =====================

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$timestamp]${NC} $1"
    echo "[$timestamp] $1" >> "$LOG_FILE" 2>/dev/null || true
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# =====================
# التحقق من المتطلبات
# =====================
check_requirements() {
    log "التحقق من المتطلبات..."
    
    [ ! -d "$APP_DIR" ] && error "مجلد التطبيق غير موجود: $APP_DIR"
    ! command -v node &> /dev/null && error "Node.js غير مثبت"
    ! command -v pnpm &> /dev/null && warning "pnpm غير مثبت، سيتم استخدام npm"
    ! command -v pm2 &> /dev/null && error "PM2 غير مثبت"
    
    success "جميع المتطلبات متوفرة"
}

# =====================
# إنشاء نسخة احتياطية
# =====================
create_backup() {
    log "إنشاء نسخة احتياطية..."
    
    mkdir -p "$BACKUP_DIR"
    
    BACKUP_NAME="backup-$(date '+%Y%m%d-%H%M%S')"
    
    cd "$APP_DIR"
    CURRENT_COMMIT=$(git rev-parse HEAD)
    echo "$CURRENT_COMMIT" > "$BACKUP_DIR/$BACKUP_NAME.txt"
    
    # نسخ dist إذا موجود
    [ -d "$APP_DIR/dist" ] && cp -r "$APP_DIR/dist" "$BACKUP_DIR/$BACKUP_NAME-dist"
    
    success "تم إنشاء النسخة الاحتياطية: $BACKUP_NAME"
    
    # حذف النسخ القديمة (الاحتفاظ بآخر 5 فقط)
    cd "$BACKUP_DIR"
    ls -t *.txt 2>/dev/null | tail -n +6 | xargs -r rm -f
}

# =====================
# سحب التحديثات
# =====================
pull_updates() {
    log "سحب التحديثات من GitHub..."
    
    cd "$APP_DIR"
    
    OLD_COMMIT=$(git rev-parse --short HEAD)
    
    if [ "$1" == "--force" ]; then
        warning "إعادة تعيين التغييرات المحلية..."
        git fetch origin
        git reset --hard origin/$BRANCH
    else
        git pull origin $BRANCH || error "فشل سحب التحديثات"
    fi
    
    NEW_COMMIT=$(git rev-parse --short HEAD)
    
    if [ "$OLD_COMMIT" == "$NEW_COMMIT" ]; then
        warning "لا توجد تحديثات جديدة (commit: $NEW_COMMIT)"
    else
        success "تم سحب التحديثات: $OLD_COMMIT → $NEW_COMMIT"
        echo ""
        log "آخر التغييرات:"
        git log --oneline -5
    fi
}

# =====================
# تثبيت الحزم
# =====================
install_dependencies() {
    log "تثبيت الحزم..."
    
    cd "$APP_DIR"
    
    if command -v pnpm &> /dev/null; then
        pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    else
        npm install
    fi
    
    success "تم تثبيت الحزم"
}

# =====================
# بناء التطبيق
# =====================
build_app() {
    log "بناء التطبيق..."
    
    cd "$APP_DIR"
    
    if command -v pnpm &> /dev/null; then
        pnpm build
    else
        npm run build
    fi
    
    [ $? -eq 0 ] && success "تم بناء التطبيق" || error "فشل البناء"
}

# =====================
# إعادة تشغيل التطبيق
# =====================
restart_app() {
    log "إعادة تشغيل التطبيق..."
    
    pm2 reload $PM2_APP_NAME 2>/dev/null || pm2 start dist/index.js --name $PM2_APP_NAME
    
    sleep 3
    
    if pm2 show $PM2_APP_NAME 2>/dev/null | grep -q "online"; then
        success "التطبيق يعمل"
    else
        warning "تحقق من حالة التطبيق يدوياً"
    fi
}

# =====================
# التحقق من الصحة
# =====================
health_check() {
    log "التحقق من صحة التطبيق..."
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "304" ]; then
        success "التطبيق يستجيب (HTTP $HTTP_CODE)"
    else
        warning "التطبيق قد لا يستجيب (HTTP $HTTP_CODE)"
    fi
}

# =====================
# العودة للنسخة السابقة
# =====================
rollback() {
    log "العودة للنسخة السابقة..."
    
    LATEST=$(ls -t "$BACKUP_DIR"/*.txt 2>/dev/null | head -1)
    
    [ -z "$LATEST" ] && error "لا توجد نسخ احتياطية"
    
    COMMIT=$(cat "$LATEST")
    log "العودة إلى: $COMMIT"
    
    cd "$APP_DIR"
    git reset --hard $COMMIT
    
    install_dependencies
    build_app
    restart_app
    
    success "تمت العودة للنسخة السابقة"
}

# =====================
# عرض الحالة
# =====================
show_status() {
    echo ""
    echo "📊 حالة تطبيق ساري"
    echo "─────────────────────"
    
    cd "$APP_DIR" 2>/dev/null && {
        echo "📁 المجلد: $APP_DIR"
        echo "🔀 الفرع: $(git branch --show-current)"
        echo "📝 Commit: $(git rev-parse --short HEAD)"
        echo "📅 آخر تحديث: $(git log -1 --format='%cr')"
    }
    
    echo ""
    pm2 show $PM2_APP_NAME 2>/dev/null || echo "⚠️ التطبيق غير مُسجل في PM2"
    
    echo ""
    health_check
}

# =====================
# البرنامج الرئيسي
# =====================

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     🚀 Sari Auto-Deploy Script            ║"
echo "║     $(date '+%Y-%m-%d %H:%M:%S')                   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# إنشاء مجلد اللوجات
mkdir -p /var/log/sari 2>/dev/null || true

case "$1" in
    --help|-h)
        echo "الاستخدام:"
        echo "  ./deploy-advanced.sh              نشر عادي"
        echo "  ./deploy-advanced.sh --force      نشر مع تجاهل التغييرات"
        echo "  ./deploy-advanced.sh --rollback   العودة للنسخة السابقة"
        echo "  ./deploy-advanced.sh --status     عرض الحالة"
        exit 0
        ;;
    --status)
        show_status
        exit 0
        ;;
    --rollback)
        check_requirements
        rollback
        exit 0
        ;;
    --force)
        FORCE="--force"
        ;;
    *)
        FORCE=""
        ;;
esac

START=$(date +%s)

check_requirements
create_backup
pull_updates $FORCE
install_dependencies
build_app
restart_app
health_check

END=$(date +%s)
DURATION=$((END - START))

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     ✅ تم النشر بنجاح!                    ║"
echo "║     ⏱️  الوقت: ${DURATION} ثانية                     ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
