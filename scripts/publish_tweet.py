import tweepy
import os
from openai import OpenAI


def summarize_release_notes(notes: str) -> str:
    """GitHub Models API (gpt-4o-mini) で release notes を日本語ツイート用に要約"""
    client = OpenAI(
        base_url="https://models.inference.ai.azure.com",
        api_key=os.environ["GITHUB_TOKEN"],
    )

    prompt = f"""以下のリリースノートを日本語で50字以内に要約してください。
リリースノートの主要な改善点・新機能を簡潔に述べてください。

リリースノート:
{notes}

要約（50字以内）:"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=100,
        temperature=0.5,
    )

    summary = response.choices[0].message.content.strip()
    # 50字以内に調整
    if len(summary) > 50:
        summary = summary[:47] + "..."
    return summary


def post_tweet(version: str, notes: str) -> None:
    """要約を含むツイートをX（Twitter）に投稿"""
    summary = summarize_release_notes(notes)

    # 指定のフォーマットで日本語ツイート作成
    tweet_text = (
        f"【リリース】illusions {version} リリースされました。"
        f"今回の内容は主に{summary}。"
        f"ダウンロード：https://www.illusions.app/downloads/"
    )

    # Twitter の実際の文字数カウント（URL短縮・全角等）とのズレを考慮して
    # 安全側の上限 240 字を適用する
    MAX_FALLBACK_SUMMARY_LEN = 30
    if len(tweet_text) > 240:
        # 概要部分を短縮
        summary = summary[:MAX_FALLBACK_SUMMARY_LEN] + "..." if len(summary) > MAX_FALLBACK_SUMMARY_LEN else summary
        tweet_text = (
            f"【リリース】illusions {version} リリース。"
            f"詳細：{summary} "
            f"https://www.illusions.app/downloads/"
        )

    client = tweepy.Client(
        consumer_key=os.environ["X_API_KEY"],
        consumer_secret=os.environ["X_API_SECRET"],
        access_token=os.environ["X_ACCESS_TOKEN"],
        access_token_secret=os.environ["X_ACCESS_TOKEN_SECRET"],
    )

    try:
        client.create_tweet(text=tweet_text)
        print(f"Tweet posted successfully: {tweet_text}")
    except Exception as e:
        print(f"Error posting tweet: {e}")
        raise


if __name__ == "__main__":
    version = os.environ.get("RELEASE_VERSION", "unknown")
    notes = os.environ.get("RELEASE_NOTES", "")

    if not notes:
        print("Warning: RELEASE_NOTES is empty")

    post_tweet(version, notes)
