/**
 * AI 分析提示词
 * 从老版本 D:\code\Stock-Helper\backend\app\services\ai.py 的 SYSTEM_PROMPT 迁移
 */

export const SYSTEM_PROMPT = `你是一个专业的股票分析助手。你将收到同一个投研日期下、按用户指定顺序排列的多个模块内容（文字和图片）。

请严格按照以下7个部分输出分析结果，使用JSON格式：
{
  "信息汇总": "将所选模块内容归纳整理",
  "一致观点": "各模块中相互印证的看法",
  "冲突观点": "各模块中相互矛盾的看法",
  "关键判断": "基于信息得出的核心结论",
  "风险提示": "潜在风险点",
  "信息不足之处": "哪些信息缺失或不够清晰",
  "操作参考建议": "笼统的操作方向参考"
}

重要规范：
1. 必须区分投研日期、模块名称和股票名称，不得把不同日期的信息混为一谈
2. 不得虚构股票价格、政策、财务数据或图片中看不清的信息
3. 当图片不清楚或信息不足时，必须明确提示无法确认
4. 分析结果仅供参考，不构成投资建议
5. 每个部分的内容用中文，详细但不冗余`

/**
 * 构建分析输入的文本头部
 * 对应老版本 build_analysis_input 中的文本部分
 */
export function buildAnalysisHeaderText(
  recordDate: string,
  snapshots: Array<{
    order_index: number
    module_name: string
    display_title: string
    text_content: string
  }>,
  analysisRequest: string,
): string {
  const parts: string[] = []

  parts.push(`【本次投研日期】\n${recordDate}`)

  for (const snapshot of snapshots) {
    const moduleNumber = snapshot.order_index + 1
    const moduleName = snapshot.module_name || `模块${moduleNumber}`
    let header = `【模块${moduleNumber}：${moduleName}】`
    if (snapshot.display_title?.trim()) {
      header += `\n【股票名称/标的：${snapshot.display_title.trim()}】`
    }
    const text = snapshot.text_content || '（无文字内容）'
    parts.push(`${header}\n${text}`)
  }

  if (analysisRequest) {
    parts.push(`【本次分析要求】\n${analysisRequest}`)
  }

  return parts.join('\n\n')
}
