FROM maven:3.9-amazoncorretto-17 AS build
WORKDIR /app
COPY . .
RUN chmod +x mvnw && ./mvnw clean package -DskipTests

FROM amazoncorretto:17
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
ENTRYPOINT ["java", "-Dfile.encoding=UTF-8", "-jar", "app.jar"]
