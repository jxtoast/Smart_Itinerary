import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiConfig } from "@/types/GeminiConfig";

export class GeminiService {
    private apiKey: string;
    private geminiModel: string;
    private genAI: GoogleGenerativeAI;

    constructor() {
        this.apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
        this.geminiModel = "gemini-2.0-flash";
        this.genAI = new GoogleGenerativeAI(this.apiKey);

        if (!this.apiKey) {
            throw new Error("Missing GEMINI_API_KEY in environment variables");
        }
    }

    public async generateContent(prompt: string, generationConfig: GeminiConfig) {
        try {
            const model = this.genAI.getGenerativeModel({ model: this?.geminiModel, generationConfig });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error("Error generating content:", error);
            return null;
        }
    }
}