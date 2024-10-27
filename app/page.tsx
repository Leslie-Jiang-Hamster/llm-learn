"use client";

import Hero from "@/components/Hero";
import Sources from "@/components/Sources";
import { useState } from "react";
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from "eventsource-parser";
import { getSystemPrompt } from "@/utils/utils";
import Chat from "@/components/Chat";
import { set } from "zod";

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [topic, setTopic] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [sources, setSources] = useState<{ name: string; url: string }[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [ageGroup, setAgeGroup] = useState("Middle School");

  const [suggestions, setSuggestions] = useState<string[]>([]);

  const updateSuggestions = (text: String) => {
    console.log("!", text);

    if (text.includes("\n1.")) {
      /*
      match a markdown style ordered list 
      */
      const matches = [...text.matchAll(/\n\d+\.[^\n]+/g)];
      let newSuggestions: string[] = [];
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const suggestion = match[0].match(/\.[^\n]+/)?.[0].slice(1).trim();
        if (suggestion) {
          /* if match with like **title**: something, than remove the something and ** mark */
          if (suggestion.includes(":"))
            newSuggestions.push(suggestion.split(":")[0].replace(/\*\*/g, ""));
          else
            newSuggestions.push(suggestion.replace(/\*\*/g, ""));
          if (match[0].includes("\n1."))
            break;
        }
      }
      setSuggestions(newSuggestions.reverse());
    }
  }

  const handleInitialChat = async () => {
    setShowResult(true);
    setLoading(true);
    setTopic(inputValue);
    setInputValue("");

    await handleSourcesAndChat(inputValue);

    setLoading(false);
  };

  const handleChat = async (messages?: { role: string; content: string }[]) => {
    setLoading(true);
    const chatRes = await fetch("/api/getChat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    if (!chatRes.ok) {
      throw new Error(chatRes.statusText);
    }

    // This data is a ReadableStream
    const data = chatRes.body;
    if (!data) {
      return;
    }

    const onParse = (event: ParsedEvent | ReconnectInterval) => {
      if (event.type === "event") {
        const data = event.data;
        try {
          const text = JSON.parse(data).text ?? "";


          // Update messages with each chunk
          setMessages((prev) => {
            console.log("setMessage", text);
            const lastMessage = prev[prev.length - 1];

            if (lastMessage.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { ...lastMessage, content: lastMessage.content + text },
              ];
            } else {
              return [...prev, { role: "assistant", content: text }];
            }
          });

        } catch (e) {
          console.error(e);
        }
      }
    };

    // https://web.dev/streams/#the-getreader-and-read-methods
    const reader = data.getReader();
    const decoder = new TextDecoder();
    const parser = createParser(onParse);
    let done = false;

    let text = "";

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value);
      parser.feed(chunkValue);
      console.log("chunkValue", chunkValue);

      chunkValue.matchAll(/data: {"text":"([^"]+)"/g).forEach((match) => {
        text += match[1].replace(/\\n/g, "\n");
      });

      if (done)
        updateSuggestions(text);
    }
    console.log("setLoading(false)");
    setLoading(false);
  };

  async function handleSourcesAndChat(question: string) {
    setIsLoadingSources(true);
    let sourcesResponse = await fetch("/api/getSources", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    let sources;
    if (sourcesResponse.ok) {
      sources = await sourcesResponse.json();

      setSources(sources);
    } else {
      setSources([]);
    }
    setIsLoadingSources(false);

    const parsedSourcesRes = await fetch("/api/getParsedSources", {
      method: "POST",
      body: JSON.stringify({ sources }),
    });
    let parsedSources;
    if (parsedSourcesRes.ok) {
      parsedSources = await parsedSourcesRes.json();
    }

    const initialMessage = [
      { role: "system", content: getSystemPrompt(parsedSources, ageGroup) },
      { role: "user", content: `${question}` },
    ];
    setMessages(initialMessage);
    await handleChat(initialMessage);
  }

  return (
    <>
      <main
        className={`mt-5 flex grow flex-col px-4 pb-4 ${showResult ? "overflow-hidden" : ""}`}
      >
        {showResult ? (
          <div className="mt-2 flex w-full grow flex-col justify-between overflow-hidden">
            <div className="flex w-full grow flex-col space-y-2 overflow-hidden">
              <div className="mx-auto flex w-full max-w-7xl grow flex-col gap-4 overflow-hidden lg:flex-row lg:gap-10">
                <Chat
                  messages={messages}
                  disabled={loading}
                  promptValue={inputValue}
                  setPromptValue={setInputValue}
                  setMessages={setMessages}
                  handleChat={handleChat}
                  topic={topic}
                  suggestions={suggestions}
                />
                <Sources sources={sources} isLoading={isLoadingSources} />
              </div>
            </div>
          </div>
        ) : (
          <Hero
            promptValue={inputValue}
            setPromptValue={setInputValue}
            handleChat={handleChat}
            ageGroup={ageGroup}
            setAgeGroup={setAgeGroup}
            handleInitialChat={handleInitialChat}
          />
        )}
      </main>
    </>
  );
}
