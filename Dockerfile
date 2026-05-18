FROM gcc:latest
WORKDIR /app
COPY . .
# Force rebuild v2
RUN g++ -std=c++17 -o server main.cpp -pthread -O2
EXPOSE 8080
CMD ["./server"]