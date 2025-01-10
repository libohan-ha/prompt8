'use client'

import { IterateDialog } from "@/components/iterate-dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { GEMINI_API_KEY } from "@/lib/api"
import { getLocalStorage } from '@/lib/utils'
import type { OptimizedPrompt, TestResult } from '@/types/prompt'
import { ArrowRightIcon, CopyIcon, Loader2, Play, PlusCircle, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function OptimizePage() {
  const router = useRouter()
  const [streamContent, setStreamContent] = useState("")
  const [promptHistory, setPromptHistory] = useState<OptimizedPrompt[]>([])
  const [isOptimizing, setIsOptimizing] = useState(true)
  const [testInput, setTestInput] = useState("")
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [model, setModel] = useState("deepseek-v3")
  const [isIterateDialogOpen, setIsIterateDialogOpen] = useState(false)
  const [isIterating, setIsIterating] = useState(false)
  const [editedContent, setEditedContent] = useState("")
  const [currentVersion, setCurrentVersion] = useState(1)
  const VERSIONS_PER_PAGE = 5 // 每页显示的版本数
  const [currentPage, setCurrentPage] = useState(1)
  const VISIBLE_VERSIONS = 3 // 一次显示3个版本
  const [startVersion, setStartVersion] = useState(1)

  // 计算总页数
  const totalPages = Math.ceil(promptHistory.length / VERSIONS_PER_PAGE)

  // 获取当前页的版本
  const getCurrentPageVersions = () => {
    const start = (currentPage - 1) * VERSIONS_PER_PAGE
    const end = start + VERSIONS_PER_PAGE
    return promptHistory.slice(start, end)
  }

  // 计算当前可见的版本
  const getVisibleVersions = () => {
    const versions = []
    for (let i = startVersion; i < startVersion + VISIBLE_VERSIONS && i <= promptHistory.length; i++) {
      versions.push(i)
    }
    return versions
  }
  
  useEffect(() => {
    const savedHistory = localStorage.getItem('optimizedPromptHistory')
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory)
        setPromptHistory(parsedHistory)
        setCurrentVersion(parsedHistory.length)
        setEditedContent(parsedHistory[parsedHistory.length - 1].content)
      } catch (error) {
        console.error('Error parsing prompt history:', error)
      }
    } else {
      const saved = getLocalStorage('optimizedPrompt')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setPromptHistory([parsed])
          setCurrentVersion(1)
          
          if (!parsed.content) {
            startOptimize(parsed.originalPrompt)
          } else {
            setStreamContent(parsed.content)
            setEditedContent(parsed.content)
            setIsOptimizing(false)
          }
      } catch (error) {
        console.error('Error parsing saved prompt:', error)
        }
      }
    }
  }, [])
  
  useEffect(() => {
    setEditedContent(streamContent)
  }, [streamContent])

  const shouldUpdate = (lastTime: number) => {
    const now = Date.now()
    if (now - lastTime >= 200) {
      return [true, now] as const
    }
    return [false, lastTime] as const
  }

  const startOptimize = async (originalPrompt: string) => {
    try {
      const saved = getLocalStorage('optimizedPrompt')
      const selectedModel = saved ? JSON.parse(saved).model : "deepseek-v3"
      
      let response: Response;
      
      if (selectedModel === "gpt4o") {
        response = await fetch("/api/gpt4o", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `你是一个专业的AI提示词优化专家。请帮我优化以下prompt...`
              },
              {
                role: "user", 
                content: originalPrompt
              }
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 2000
          })
        })
      } else if (selectedModel === "gemini-1206" || selectedModel === "gemini-2.0-flash-exp") {
        // 处理 Gemini 模型
        const modelName = selectedModel === "gemini-1206" ? "gemini-exp-1206" : "gemini-2.0-flash-exp"
        
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [{ text: `Instructions: 你是一个专业的AI提示词优化专家。请帮我优化以下prompt...\n\nInput: ${originalPrompt}` }]
              }],
              generationConfig: selectedModel === "gemini-2.0-flash-exp" ? {
                temperature: 0.9,
                maxOutputTokens: 2048,
              } : {
                temperature: 1,
                topK: 64,
                topP: 0.95,
                maxOutputTokens: 8192,
              }
            })
          }
        )

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || '优化请求失败')
        }

        // 特别处理Gemini的响应
        const result = await response.json()
        if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
          const content = result.candidates[0].content.parts[0].text
          setStreamContent(content)
          
          // 更新历史记录
          const optimizedPrompt = {
            content: content,
            originalPrompt: originalPrompt,
            version: promptHistory.length + 1
          }
          
          const newHistory = [...promptHistory, optimizedPrompt]
          setPromptHistory(newHistory)
          setCurrentVersion(newHistory.length)
          localStorage.setItem('optimizedPromptHistory', JSON.stringify(newHistory))
          localStorage.setItem('optimizedPrompt', JSON.stringify(optimizedPrompt))
        }
        
        return; // 提前返回，不执行后续的流处理逻辑
      } else {
        response = await fetch("/api/deepseek", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              {
                role: "system",
                content: `你是一个专业的AI提示词优化专家。请帮我优化以下prompt...`
              },
              {
                role: "user", 
                content: originalPrompt
              }
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 2000
          })
        })
      }

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '优化请求失败')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""
      let updateTimeout: NodeJS.Timeout | null = null
      let contentBuffer = ""
      let lastUpdateTime = Date.now()

      const cleanContent = (content: string) => {
        content = content.replace(/\n{3,}/g, '\n\n')
        
        const sections = new Map()
        const processedLines = new Set()
        const lines = content.split('\n')
        const cleanedLines = lines.filter(line => {
          if (!line.trim()) return true
          
          if (line.startsWith('# Role:') || 
              line.startsWith('## Profile') ||
              line.startsWith('## Skills') ||
              line.startsWith('## Rules') ||
              line.startsWith('## Workflows')) {
            if (sections.has(line)) return false
            sections.set(line, true)
            return true
          }
          
          if (processedLines.has(line)) return false
          processedLines.add(line)
          return true
        })

        return cleanedLines.join('\n')
      }

      const updateContent = (content: string, force = false) => {
        if (!force) {
          const [should, newTime] = shouldUpdate(lastUpdateTime)
          if (!should) return
          lastUpdateTime = newTime
        }

        if (updateTimeout) {
          clearTimeout(updateTimeout)
        }

        updateTimeout = setTimeout(() => {
          const cleanedContent = cleanContent(content)
          setStreamContent(cleanedContent)
        }, 200)
      }

      while (reader) {
        const { done, value } = await reader.read()
        if (done) {
          if (contentBuffer) {
            fullContent += contentBuffer
            updateContent(fullContent, true)
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          if (chunk.startsWith('data: ')) {
            const data = chunk.slice(6)
            if (data === '[DONE]') break

            try {
              const json = JSON.parse(data)
              const content = json.choices[0]?.delta?.content || ''
              if (content) {
                contentBuffer += content
                
                if (contentBuffer.length >= 100 || 
                    contentBuffer.includes('\n\n') || 
                    contentBuffer.includes('## ') || 
                    contentBuffer.includes('# ')) {
                  fullContent += contentBuffer
                  setStreamContent(fullContent)
                  contentBuffer = ""
                }
              }
            } catch (e) {
              console.error('Error parsing SSE message:', e)
            }
          }
        }
      }

      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }

      const finalContent = cleanContent(fullContent)
      setStreamContent(finalContent)

      const optimizedPrompt = {
        content: finalContent,
        originalPrompt: originalPrompt,
    version: 1
  }

      setPromptHistory([optimizedPrompt])
      localStorage.setItem('optimizedPrompt', JSON.stringify(optimizedPrompt))

    } catch (error) {
      console.error(error)
      toast({
        variant: "destructive",
        title: "优化失败",
        description: error instanceof Error ? error.message : "未知错误"
      })
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleTest = async () => {
    try {
      setIsLoading(true)
      setTestResult(null)

      if (model === "gpt4o") {
        const response = await fetch("/api/gpt4o", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: editedContent
              },
              {
                role: "user", 
                content: testInput
              }
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 2000
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || '测试请求失败')
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let contentBuffer = ""
        
        while (reader) {
          const { done, value } = await reader.read()
          if (done) {
            setTestResult({
              input: testInput,
              output: contentBuffer,
              model: model
            })
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n')
          buffer = chunks.pop() || ''

          for (const chunk of chunks) {
            if (chunk.startsWith('data: ')) {
              const data = chunk.slice(6)
              if (data === '[DONE]') break

              try {
                const json = JSON.parse(data)
                const content = json.choices[0]?.delta?.content || ''
                if (content) {
                  contentBuffer += content
                  setTestResult(prev => ({
                    input: testInput,
                    output: contentBuffer,
                    model: model
                  }))
                }
              } catch (e) {
                console.error('Error parsing SSE message:', e)
              }
            }
          }
        }
      } else if (model === "gemini-1206" || model === "gemini-2.0-flash-exp") {
        const modelName = model === "gemini-1206" ? "gemini-exp-1206" : "gemini-2.0-flash-exp"
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [{ text: `Instructions: ${editedContent}\n\nInput: ${testInput}` }]
              }],
              generationConfig: model === "gemini-2.0-flash-exp" ? {
                temperature: 0.9,
                maxOutputTokens: 2048,
              } : {
                temperature: 1,
                topK: 64,
                topP: 0.95,
                maxOutputTokens: 8192,
              }
            })
          }
        )

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || '测试请求失败')
        }

        const result = await response.json()
        if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
          const content = result.candidates[0].content.parts[0].text
          setTestResult({
            input: testInput,
            output: content,
            model: model
          })
        }
        
        return; // 提前返回，不执行后续的流处理逻辑
      } else if (model === "deepseek-v3") {
        const response = await fetch("/api/deepseek", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              {
                role: "system",
                content: editedContent
              },
              {
                role: "user", 
                content: testInput
              }
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 2000
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || '测试请求失败')
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let contentBuffer = ""
        
        while (reader) {
          const { done, value } = await reader.read()
          if (done) {
            setTestResult({
              input: testInput,
              output: contentBuffer,
              model: model
            })
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n')
          buffer = chunks.pop() || ''

          for (const chunk of chunks) {
            if (chunk.startsWith('data: ')) {
              const data = chunk.slice(6)
              if (data === '[DONE]') break

              try {
                const json = JSON.parse(data)
                const content = json.choices[0]?.delta?.content || ''
                if (content) {
                  contentBuffer += content
                  setTestResult(prev => ({
                    input: testInput,
                    output: contentBuffer,
                    model: model
                  }))
                }
              } catch (e) {
                console.error('Error parsing SSE message:', e)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(error)
      toast({
        title: "测试失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewProject = () => {
    localStorage.removeItem('optimizedPrompt')
    localStorage.removeItem('optimizedPromptHistory')
    router.push('/')
  }

  const handleCopy = async () => {
    try {
      const contentToCopy = editedContent || streamContent

      if (!contentToCopy.trim()) {
      toast({
          title: "复制失败",
          description: "没有可复制的内容",
        variant: "destructive"
      })
        return
      }

      // 创建一个临时文本区域
      const textarea = document.createElement('textarea')
      textarea.value = contentToCopy
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      
      try {
        // 选择并复制文本
        textarea.select()
        document.execCommand('copy')
        toast({
          title: "复制成功",
          description: "已复制到剪贴板"
        })
      } catch (err) {
        console.error('Fallback copy error:', err)
        toast({
          title: "复制失败",
          description: "请手动复制",
          variant: "destructive"
        })
      } finally {
        // 清理临时元素
        document.body.removeChild(textarea)
      }
    } catch (error) {
      console.error('Copy error:', error)
      toast({
        title: "复制失败",
        description: "请手动复制",
        variant: "destructive"
      })
    }
  }

  const handleIterate = async (feedback: string) => {
    try {
      setIsIterateDialogOpen(false)
      
      setIsIterating(true)
      setStreamContent("")
      setTestResult(null)
      setTestInput("")

      const optimizedSection = document.querySelector('.optimized-prompt-section')
      optimizedSection?.scrollIntoView({ behavior: 'smooth' })

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `你是一个专业的AI提示词优化专家。请根据用户的要求优化以下prompt：

当前prompt:
${editedContent}

用户的优化要求:
${feedback}

请基于用户的要求优化prompt，返回格式不变。`
            },
            {
              role: "user",
              content: "请根据以上要求优化prompt。"
            }
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 2000
        })
      })

      if (!response.ok) throw new Error('迭代请求失败')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""
      let updateTimeout: NodeJS.Timeout | null = null
      let contentBuffer = ""
      let lastUpdateTime = Date.now()

      const cleanContent = (content: string) => {
        content = content.replace(/\n{3,}/g, '\n\n')
        
        const sections = new Map()
        const processedLines = new Set()
        const lines = content.split('\n')
        const cleanedLines = lines.filter(line => {
          if (!line.trim()) return true
          
          if (line.startsWith('# Role:') || 
              line.startsWith('## Profile') ||
              line.startsWith('## Skills') ||
              line.startsWith('## Rules') ||
              line.startsWith('## Workflows')) {
            if (sections.has(line)) return false
            sections.set(line, true)
            return true
          }
          
          if (processedLines.has(line)) return false
          processedLines.add(line)
          return true
        })

        return cleanedLines.join('\n')
      }

      const updateContent = (content: string, force = false) => {
        if (!force) {
          const [should, newTime] = shouldUpdate(lastUpdateTime)
          if (!should) return
          lastUpdateTime = newTime
        }

        if (updateTimeout) {
          clearTimeout(updateTimeout)
        }

        updateTimeout = setTimeout(() => {
          const cleanedContent = cleanContent(content)
          setStreamContent(cleanedContent)
        }, 200)
      }

      while (reader) {
        const { done, value } = await reader.read()
        if (done) {
          if (contentBuffer) {
            fullContent += contentBuffer
            updateContent(fullContent, true)
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          if (chunk.startsWith('data: ')) {
            const data = chunk.slice(6)
            if (data === '[DONE]') break

            try {
              const json = JSON.parse(data)
              const content = json.choices[0]?.delta?.content || ''
              if (content) {
                contentBuffer += content
                
                if (contentBuffer.length >= 100 || 
                    contentBuffer.includes('\n\n') || 
                    contentBuffer.includes('## ') || 
                    contentBuffer.includes('# ')) {
                  fullContent += contentBuffer
                  setStreamContent(fullContent)
                  contentBuffer = ""
                }
              }
            } catch (e) {
              console.error('Error parsing SSE message:', e)
            }
          }
        }
      }

      const newVersion = promptHistory.length + 1
      const newPrompt = {
        content: fullContent,
        originalPrompt: editedContent,
        version: newVersion,
        feedback: feedback
      }

      const newHistory = [...promptHistory, newPrompt]
      setPromptHistory(newHistory)
      setCurrentVersion(newVersion)
      // 自动滚动到最新版本
      setStartVersion(Math.max(1, newVersion - VISIBLE_VERSIONS + 1))
      
      localStorage.setItem('optimizedPrompt', JSON.stringify(newPrompt))
      localStorage.setItem('optimizedPromptHistory', JSON.stringify(newHistory))

    } catch (error) {
      console.error(error)
      toast({
        variant: "destructive",
        title: "迭代失败",
        description: error instanceof Error ? error.message : "未知错误"
      })
    } finally {
      setIsIterating(false)
    }
  }

  const handleVersionChange = (version: number) => {
    const prompt = promptHistory[version - 1]
    if (prompt) {
      setCurrentVersion(version)
      setEditedContent(prompt.content)
    }
  }

  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto bg-white/90 rounded-2xl sm:rounded-[40px] shadow-2xl overflow-hidden backdrop-blur-lg">
          <div className="p-6 sm:p-8 lg:p-12 space-y-6 sm:space-y-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
              Prompt Optimizer
            </h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
              {/* Optimized Prompt */}
              <div className="flex flex-col h-full optimized-prompt-section">
                <div className="flex-1 bg-blue-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-4 shadow-lg border border-blue-100">
                  <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h2 className="text-xl sm:text-2xl font-semibold text-blue-800">
                      {isIterating ? "正在优化..." : "优化后Prompt"}
                    </h2>
                    {promptHistory.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-blue-600">版本:</span>
                        <div className="flex items-center gap-1">
                          {/* 向前滑动按钮 */}
                          {startVersion > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setStartVersion(v => Math.max(1, v - 1))}
                              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                            >
                              ←
                            </Button>
                          )}
                          
                          {/* 版本按钮 */}
                          {getVisibleVersions().map(version => (
                            <Button
                              key={version}
                              variant={currentVersion === version ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleVersionChange(version)}
                              className={`min-w-[32px] h-8 px-2 ${
                                currentVersion === version 
                                  ? "bg-blue-600 text-white" 
                                  : "text-blue-600 hover:bg-blue-50"
                              }`}
                            >
                              {version}
                            </Button>
                          ))}

                          {/* 向后滑动按钮 */}
                          {startVersion + VISIBLE_VERSIONS <= promptHistory.length && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setStartVersion(v => v + 1)}
                              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                            >
                              →
                            </Button>
                          )}
                        </div>
                    </div>
                    )}
                  </div>
                  <Textarea
                    className="h-[450px] resize-none bg-white border-2 border-blue-100 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-base sm:text-lg p-4"
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder="优化后的prompt将在这里显示..."
                  />
                </div>
                <div className="mt-4 flex gap-4">
                  <Button 
                    variant="outline" 
                    className="flex-1 h-12 sm:h-16 px-6 sm:px-8 text-base sm:text-lg rounded-xl sm:rounded-2xl bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-400 flex items-center justify-center space-x-3 transition-all duration-300 ease-in-out transform hover:scale-105"
                    onClick={handleCopy}
                  >
                        <CopyIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                        <span>复制</span>
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 h-12 sm:h-16 px-6 sm:px-8 text-base sm:text-lg rounded-xl sm:rounded-2xl bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-400 flex items-center justify-center space-x-3 transition-all duration-300 ease-in-out transform hover:scale-105"
                    onClick={() => setIsIterateDialogOpen(true)}
                  >
                    <ArrowRightIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                        <span>迭代</span>
                  </Button>
                </div>
              </div>

              {/* Content to Process */}
              <div className="flex flex-col h-full">
                <div className="flex-1 bg-green-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-4 shadow-lg border border-green-100">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-xl sm:text-2xl font-semibold text-green-800">待处理内容</h2>
                    <p className="text-sm text-green-600">
                      在这里输入需要处理的实际内容（如：需要翻译的文章、需要检查的代码等），
                      点击下方"测试"按钮验证优化后的prompt效果。
                    </p>
                  </div>
                  <Textarea 
                    className="h-[450px] resize-none bg-white border-2 border-green-100 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-green-400 focus:border-transparent text-base sm:text-lg p-4"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder="输入实际内容进行测试，例如：
- 如果是翻译prompt，在这里输入要翻译的文章
- 如果是代码检查prompt，在这里输入要检查的代码
- 如果是文章总结prompt，在这里输入要总结的文章
..."
                  />
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <Button 
                    variant="outline"
                    className="flex-1 h-12 sm:h-16 px-6 sm:px-8 text-base sm:text-lg rounded-xl sm:rounded-2xl bg-white hover:bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-400 flex items-center justify-center space-x-3 transition-all duration-300 ease-in-out transform hover:scale-105"
                    onClick={handleTest}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        <span>处理中...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 sm:w-6 sm:h-6" />
                        <span>测试</span>
                      </>
                    )}
                  </Button>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="w-[200px] h-12 sm:h-16 text-base sm:text-lg bg-white border-orange-200 text-orange-600 rounded-xl sm:rounded-2xl">
                      <Zap className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deepseek-v3">DeepSeek V3</SelectItem>
                      <SelectItem value="gemini-1206">Gemini 1206</SelectItem>
                      <SelectItem value="gemini-2.0-flash-exp">Gemini 2.0 Flash</SelectItem>
                      <SelectItem value="gpt4o">GPT-4o</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Output Preview */}
              <div className="flex flex-col h-full">
                <div className="flex-1 bg-purple-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-4 shadow-lg border border-purple-100">
                  <h2 className="text-xl sm:text-2xl font-semibold text-purple-800 mb-4 sm:mb-6">输出预览</h2>
                  <Textarea 
                    className="h-[450px] resize-none bg-white border-2 border-purple-100 rounded-xl sm:rounded-2xl focus:ring-2 focus:ring-purple-400 focus:border-transparent text-base sm:text-lg p-4"
                    value={testResult?.output ?? ''}
                    readOnly
                    placeholder="测试结果将在这里显示..."
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    className="h-12 sm:h-16 px-6 sm:px-8 text-base sm:text-lg rounded-xl sm:rounded-2xl bg-white hover:bg-green-50 text-green-600 border-green-200 hover:border-green-400 flex items-center justify-center space-x-3 transition-all duration-300 ease-in-out transform hover:scale-105"
                    onClick={handleNewProject}
                  >
                    <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                    <span>新建项目</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <IterateDialog
        open={isIterateDialogOpen}
        onOpenChange={setIsIterateDialogOpen}
        onConfirm={handleIterate}
        isLoading={isIterating}
      />
    </>
  )
}
