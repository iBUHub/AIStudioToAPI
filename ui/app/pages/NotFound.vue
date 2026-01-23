<!--
 * File: ui/app/pages/NotFound.vue
 * Description: 404 Not Found page component for handling invalid routes
 *
 * Author: Ellinav, iBenzene, bbbugg
-->

<template>
    <div class="not-found">
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <a href="/">Return to status</a>
    </div>
</template>

<style scoped>
.not-found {
    align-items: center;
    display: flex;
    flex-direction: column;
    height: 100vh;
    justify-content: center;
}

.not-found h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
}

.not-found a {
    color: #007bff;
    margin-top: 1rem;
    text-decoration: none;
}

.not-found a:hover {
    text-decoration: underline;
}
</style>
