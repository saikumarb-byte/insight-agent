import axios from "axios";
import type { AxiosInstance } from "axios";
import dotenv from "dotenv";

dotenv.config();

console.log("WP_BASE_URL:", process.env.WP_BASE_URL);
console.log("WP_USERNAME:", process.env.WP_USERNAME);
console.log(
  "WP_APP_PASSWORD:",
  process.env.WP_APP_PASSWORD ? "LOADED" : "MISSING"
);

class WordPressClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = process.env.WP_BASE_URL;
    const username = process.env.WP_USERNAME;
    const appPassword = process.env.WP_APP_PASSWORD;

    if (!baseURL || !username || !appPassword) {
      throw new Error(
        "WordPress environment variables are missing"
      );
    }

    this.client = axios.create({
      baseURL: `${baseURL}/wp-json`,
      auth: {
        username,
        password: appPassword,
      },
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async healthCheck() {
    const response = await this.client.get("/wp/v2/users/me");

    return {
      success: true,
      user: response.data,
    };
  }


                        async getPosts() {
                        const response = await this.client.get("/wp/v2/posts", {
                            params: {
                            per_page: 5,
                            },
                        });

                        return response.data;
    }


    async getPostTypes() {
  const response = await this.client.get("/wp/v2/types");

  return response.data;
}

async getApiRoot() {
  const response = await this.client.get("/");

  return response.data;
}
}




export default new WordPressClient();

