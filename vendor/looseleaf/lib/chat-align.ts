"use client"

import * as React from "react"

type ChatAlign = "start" | "end"

const ChatAlignContext = React.createContext<ChatAlign | undefined>(undefined)

function useChatAlign(): ChatAlign | undefined {
  return React.useContext(ChatAlignContext)
}

export { ChatAlignContext, useChatAlign }
export type { ChatAlign }
