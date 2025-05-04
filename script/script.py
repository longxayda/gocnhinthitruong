import requests
import random
import os
import nltk
import json
import signal

# schedule
import schedule
import time
import threading

from dotenv import load_dotenv
from newspaper import Article, news_pool
from datetime import datetime
from bs4 import BeautifulSoup
from typing import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, wait, ALL_COMPLETED

load_dotenv(override=True)
BOT_TOKEN = os.getenv('BOT_TOKEN')
CHAT_ID = os.getenv('CHAT_ID')
CHANNEL_ID = os.getenv('CHANNEL_ID_')
EXTRA_CHANNEL_ID = os.getenv('EXTRA_CHANNEL_ID')  # New channel
nltk.download("punkt")

DEFAULT_IMG=""

def make_get_request(url: str):
    return url, requests.get(url)

def make_article_request(article_link):
    return Article(url=article_link)

def process_telegram(message: str):
    telegram_api_urls = [
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage?chat_id={CHANNEL_ID}&text={message}&parse_mode=HTML",
        # f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage?chat_id={EXTRA_CHANNEL_ID}&text={message}&parse_mode=HTML"
    ]
    return threading_function(telegram_api_urls, make_get_request)

def concurr_download_articles(articles):
    print("Downloading articles concurrently...")
    start = datetime.now()
    news_pool.set(articles)
    news_pool.join()
    print("Done")
    end = datetime.now()
    print(f"Took {(end-start).microseconds / 1000} milisecs")

def threading_function(itrs: Iterable, func: Callable, is_sequential=False):
    start = datetime.now()
    responses = []
    if is_sequential:
        responses = [func(itr) for itr in itrs]
    else:
        with ThreadPoolExecutor(len(itrs)) as executor:
            futures = [executor.submit(func, itr) for itr in itrs]
            wait(futures, return_when=ALL_COMPLETED)
            responses = [future.result() for future in futures]
    end = datetime.now()
    print(f"{func.__name__}(){itrs} took {(end-start).microseconds / 1000} milisecs")
    return responses

def lambda_handler(event, context):
    urls = [
        "https://cafef.vn/tai-chinh-quoc-te.chn",
        "https://blogtienao.com/",
        "https://cafebitcoin.org/",
        "https://tradecoinvn.net/",
    ]
    messages = []

    resps = threading_function(urls, make_get_request)

    for url, resp in resps:
        soup = BeautifulSoup(resp.text, "html.parser")
        if "cafef" in url:
            headlines = soup.find_all("div", class_="firstitem")
            first_headline = headlines[0]
            headline_link = "https://cafef.vn" + first_headline.find("a")["href"]
            messages.append(f"{headline_link}")
        if "blogtienao" in url:
            headlines = soup.find_all("div", {"id": "tdi_58"})
            first_headline = headlines[0] if headlines else ""
            if not first_headline:
                continue
            headline_link = first_headline.find("a")["href"]
            messages.append(f"{headline_link}")
        if "cafebitcoin" in url:
            headlines = soup.find_all("article", class_="jeg_post")
            random_headline = random.choices(population=headlines, k=1)[0]
            headline_link = random_headline.find("a")["href"]
            messages.append(f"{headline_link}")
        if "tradecoinvn" in url:
            div_list = soup.find("h2", {"id": "newsfeed_home"})
            next_sibling = div_list.find_next_sibling("div")
            links = next_sibling.find_all("a")
            random_headline = random.choices(population=links, k=1)[0]
            headline_link = "https://tradecoinvn.net" + random_headline["href"]
            messages.append(f"{headline_link}")
        

    articles = threading_function(messages, make_article_request)
    concurr_download_articles(articles=articles)

    summarized_contents = []
    summarized_content_with_thumbnail = []
    for article in articles:
        article.parse()
        thumbnail = article.top_image
        article.nlp()
        title = f"<b>{article.title}</b>\n"
        summary = f"<b>Tóm tắt: </b>{article.summary}\n"
        link = f"Đọc tại đây: {article.url}"
        payload = {"title": article.title, "summary": article.summary, "link": article.url, "thumbnail": thumbnail}
        chat_content = f"{title} \n{summary} \n{link}"
        summarized_contents.append(chat_content)
        summarized_content_with_thumbnail.append(payload)

    result_json = json.dumps(summarized_content_with_thumbnail, ensure_ascii=False)
    # threading_function(summarized_contents, process_telegram)
    return {"body": result_json}

API_URL = "https://api.gocnhinthitruong.com/api/articles/{topic}"  # Địa chỉ API của server.js

def send_articles_to_server(articles, topic="tintuc"):
    for article in articles:
        response = requests.post(API_URL.format(topic=topic), json=article)
        if response.status_code == 201:
            print(f"✔ Đã gửi bài viết: {article['title']}")
        else:
            print(f"❌ Lỗi khi gửi bài viết: {response.text}")

# schedule
def scheduled_job():
    print("🔄 Chạy script lấy tin tức...")
    event = ""
    context = ""
    result = lambda_handler(event, context)  # Lấy tin tức
    articles = json.loads(result["body"])  # Chuyển JSON thành danh sách
    send_articles_to_server(articles, topic="tintuc")  # Gửi từng bài viết đến API

# Lên lịch chạy theo giờ
schedule.every().day.at("08:00").do(scheduled_job)
schedule.every().day.at("11:30").do(scheduled_job)
schedule.every().day.at("17:00").do(scheduled_job)

stop_event = threading.Event()

def signal_handler(sig, frame):
    print("🛑 Nhận tín hiệu thoát, dừng lịch trình...")
    stop_event.set()

# Bắt tín hiệu ngắt (Ctrl+C hoặc lệnh kill)
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def run_scheduler():
    print("✅ Bắt đầu lịch trình lấy tin tức mỗi 5 phút...")
    while not stop_event.is_set():
        schedule.run_pending()
        time.sleep(60)  # Kiểm tra lịch trình mỗi phút
    print("📴 Lịch trình đã dừng.")

# Chạy lịch trình trong một thread riêng
scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
scheduler_thread.start()

# Chờ tín hiệu ngắt
try:
    while not stop_event.is_set():
        time.sleep(1)
except KeyboardInterrupt:
    print("\n🛑 Nhận tín hiệu Ctrl+C, dừng chương trình...")
    stop_event.set()
    scheduler_thread.join()
    print("📴 Thoát chương trình thành công.")



