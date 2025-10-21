"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem("user")
    if (user) {
      router.push("/chat")
    } else {
      router.push("/login")
    }
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-background via-background to-accent/10">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">SABA</h1>
        <p className="text-muted-foreground">Your AI Assistant</p>
      </div>
    </div>
  )
}
