I want to make an app to help me memorize the spelling of korean words.

I want to be given a form for input.

Then on the left side I can input english words.

On the right side I can input korean words.

They will be stored in dynamo (word batches, not individual words)

When I submit a new batch, we will check if there is an existing batch small enough to fit the new words in. We will keep adding words to the most recent batch (using individual update statements) until one of them fails. Then we will start a new batch.

We will use CDK for the backend. It will create a dynamo table and a lambda.

We will use react with tailwind for the front end. (vite)