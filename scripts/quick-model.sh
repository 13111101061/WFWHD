#!/bin/bash

# TTS模型快速管理脚本
# 提供常用的模型管理操作快捷方式

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_MANAGER="$SCRIPT_DIR/model-manager.js"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 帮助信息
show_help() {
    echo -e "${BLUE}🎵 TTS模型快速管理工具${NC}"
    echo ""
    echo "用法: $0 <command> [args]"
    echo ""
    echo "快捷命令:"
    echo "  list                    - 列出所有模型"
    echo "  search <keyword>        - 搜索模型"
    echo "  stats                   - 显示统计信息"
    echo "  add <provider> <name>  - 快速添加模型（交互式）"
    echo "  disable <model-id>     - 禁用模型"
    echo "  enable <model-id>      - 启用模型"
    echo "  delete <model-id>      - 删除模型"
    echo "  reload                  - 重新加载配置"
    echo "  backup                  - 备份当前配置"
    echo "  help                    - 显示帮助信息"
    echo ""
    echo "高级命令:"
    echo "  import <file>           - 批量导入模型"
    echo "  export <file>           - 导出模型到文件"
    echo ""
}

# 检查命令是否存在
check_model_manager() {
    if [ ! -f "$MODEL_MANAGER" ]; then
        echo -e "${RED}❌ 找不到 model-manager.js${NC}"
        exit 1
    fi
}

# 列出所有模型
list_models() {
    check_model_manager
    node "$MODEL_MANAGER" list
}

# 搜索模型
search_models() {
    if [ -z "$2" ]; then
        echo -e "${RED}❌ 请提供搜索关键词${NC}"
        exit 1
    fi
    check_model_manager
    node "$MODEL_MANAGER" search "$2"
}

# 显示统计信息
show_stats() {
    check_model_manager
    node "$MODEL_MANAGER" stats
}

# 快速添加模型
quick_add() {
    if [ -z "$2" ] || [ -z "$3" ]; then
        echo -e "${RED}❌ 用法: $0 add <provider> <name>${NC}"
        exit 1
    fi

    check_model_manager

    local provider="$2"
    local name="$3"
    local model_id="${provider}-${name,,}-v1"

    echo -e "${BLUE}🔧 正在创建模型: $name${NC}"
    echo "提供商: $provider"
    echo "模型ID: $model_id"
    echo ""

    # 简单的交互式输入
    read -p "性别 (female/male) [female]: " gender
    gender=${gender:-female}

    read -p "年龄 (young/adult/mature) [young]: " age
    age=${age:-young}

    read -p "语言 (zh-CN/en-US) [zh-CN]: " language
    language=${language:-zh-CN}

    read -p "标签 (用逗号分隔): " tags

    # 构建JSON
    local model_json=$(cat <<EOF
{
  "id": "$model_id",
  "name": "$name",
  "provider": "$provider",
  "service": "tts",
  "model": "tts-v1",
  "voiceId": "$model_id",
  "category": "$gender",
  "gender": "$gender",
  "languages": ["$language"],
  "age": "$age",
  "style": "gentle",
  "characteristics": ["clear"],
  "tags": [$tags],
  "description": "$name - $provider 模型",
  "useCases": ["general"],
  "status": "active"
}
EOF
)

    echo ""
    echo -e "${YELLOW}📋 模型信息预览:${NC}"
    echo "$model_json" | jq . 2>/dev/null || echo "$model_json"
    echo ""

    read -p "确认添加? (y/N): " confirm
    if [[ $confirm =~ ^[Yy]$ ]]; then
        if node "$MODEL_MANAGER" add "$model_json"; then
            # 重新加载配置
            reload_config
            echo -e "${GREEN}✅ 模型添加成功并已重新加载${NC}"
        fi
    else
        echo -e "${YELLOW}❌ 取消添加${NC}"
    fi
}

# 禁用模型
disable_model() {
    if [ -z "$2" ]; then
        echo -e "${RED}❌ 请提供模型ID${NC}"
        exit 1
    fi
    check_model_manager
    if node "$MODEL_MANAGER" update-status "$2" "inactive"; then
        reload_config
        echo -e "${GREEN}✅ 模型 $2 已禁用${NC}"
    fi
}

# 启用模型
enable_model() {
    if [ -z "$2" ]; then
        echo -e "${RED}❌ 请提供模型ID${NC}"
        exit 1
    fi
    check_model_manager
    if node "$MODEL_MANAGER" update-status "$2" "active"; then
        reload_config
        echo -e "${GREEN}✅ 模型 $2 已启用${NC}"
    fi
}

# 删除模型
delete_model() {
    if [ -z "$2" ]; then
        echo -e "${RED}❌ 请提供模型ID${NC}"
        exit 1
    fi

    echo -e "${RED}⚠️  即将删除模型: $2${NC}"
    read -p "确认删除? (y/N): " confirm
    if [[ $confirm =~ ^[Yy]$ ]]; then
        check_model_manager
        if node "$MODEL_MANAGER" remove "$2"; then
            reload_config
            echo -e "${GREEN}✅ 模型 $2 已删除${NC}"
        fi
    else
        echo -e "${YELLOW}❌ 取消删除${NC}"
    fi
}

# 重新加载配置
reload_config() {
    echo -e "${BLUE}🔄 重新加载配置...${NC}"
    local result=$(curl -s -X POST -H "X-API-Key: key2" \
        "http://localhost:3000/api/voice-models/reload")

    if echo "$result" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ 配置重新加载成功${NC}"
    else
        echo -e "${RED}❌ 配置重新加载失败${NC}"
        echo "$result"
    fi
}

# 备份配置
backup_config() {
    local backup_file="backup/voice-models-$(date +%Y%m%d-%H%M%S).json"
    mkdir -p backup

    check_model_manager
    if node "$MODEL_MANAGER" export "$backup_file"; then
        echo -e "${GREEN}✅ 配置已备份到: $backup_file${NC}"
    fi
}

# 批量导入
import_models() {
    if [ -z "$2" ]; then
        echo -e "${RED}❌ 请提供要导入的文件${NC}"
        exit 1
    fi
    check_model_manager
    if node "$MODEL_MANAGER" import "$2"; then
        reload_config
        echo -e "${GREEN}✅ 批量导入完成${NC}"
    fi
}

# 导出模型
export_models() {
    if [ -z "$2" ]; then
        echo -e "${RED}❌ 请提供要导出的文件${NC}"
        exit 1
    fi
    check_model_manager
    node "$MODEL_MANAGER" export "$2"
}

# 主函数
main() {
    case "$1" in
        "list"|"ls")
            list_models
            ;;
        "search"|"find")
            search_models "$@"
            ;;
        "stats"|"stat")
            show_stats
            ;;
        "add"|"create")
            quick_add "$@"
            ;;
        "disable"|"off")
            disable_model "$@"
            ;;
        "enable"|"on")
            enable_model "$@"
            ;;
        "delete"|"del"|"rm")
            delete_model "$@"
            ;;
        "reload"|"refresh")
            reload_config
            ;;
        "backup"|"bak")
            backup_config
            ;;
        "import")
            import_models "$@"
            ;;
        "export")
            export_models "$@"
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            echo -e "${RED}❌ 未知命令: $1${NC}"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"